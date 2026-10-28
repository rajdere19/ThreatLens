import json, math, os, pickle, re, sqlite3, urllib.parse, uuid
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

ROOT = Path(__file__).parent
app = Flask(__name__, static_folder=str(ROOT / 'frontend' / 'dist'), static_url_path='')
CORS(app)
DB = ROOT / 'threatlens.db'

# Load ML Models safely
try:
    vector = pickle.load(open(ROOT / 'vectorizer.pkl', 'rb'))
except Exception as e:
    vector = None
    print(f"Warning loading vectorizer: {e}")

try:
    model_lr = pickle.load(open(ROOT / 'phishing.pkl', 'rb'))
except Exception as e:
    model_lr = None
    print(f"Warning loading logistic regression model: {e}")

try:
    model_mnb = pickle.load(open(ROOT / 'phishing_mnb.pkl', 'rb'))
except Exception as e:
    model_mnb = None

# Verified Brand Knowledge Base (Official Apex Domains)
BRAND_DIRECTORY = {
    'paypal': ['paypal.com', 'paypal.me'],
    'google': ['google.com', 'google.co.in', 'google.co.uk', 'accounts.google.com', 'gmail.com', 'youtube.com', 'googledrive.com'],
    'apple': ['apple.com', 'icloud.com', 'appleid.apple.com', 'itunes.com'],
    'microsoft': ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'microsoftonline.com', 'azure.com', 'sharepoint.com', 'bing.com', 'msn.com'],
    'amazon': ['amazon.com', 'amazon.co.uk', 'amazon.in', 'amazon.de', 'aws.amazon.com', 'primevideo.com'],
    'netflix': ['netflix.com'],
    'facebook': ['facebook.com', 'fb.com', 'messenger.com', 'meta.com'],
    'instagram': ['instagram.com'],
    'whatsapp': ['whatsapp.com'],
    'twitter': ['twitter.com', 'x.com', 't.co'],
    'chase': ['chase.com', 'jpmorganchase.com'],
    'wellsfargo': ['wellsfargo.com'],
    'bankofamerica': ['bankofamerica.com', 'bofa.com'],
    'citibank': ['citi.com', 'citibank.com'],
    'github': ['github.com', 'github.io'],
    'linkedin': ['linkedin.com'],
    'wikipedia': ['wikipedia.org', 'wikimedia.org'],
    'dropbox': ['dropbox.com'],
    'steam': ['steampowered.com', 'steamcommunity.com'],
    'binance': ['binance.com'],
    'coinbase': ['coinbase.com'],
    'ebay': ['ebay.com', 'ebay.co.uk'],
    'adobe': ['adobe.com']
}

# Typosquatting / Leetspeak character substitutions
TYPOSQUAT_MAP = {
    '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '8': 'b', '@': 'a', 'vv': 'w'
}

# Suspicious & high-abuse Top Level Domains
SUSPICIOUS_TLDS = {
    'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'buzz', 'fit', 'work',
    'icu', 'cyou', 'rest', 'ru', 'click', 'link', 'stream', 'loan', 'party',
    'bid', 'date', 'faith', 'racing', 'win', 'men', 'accountant', 'download',
    'support', 'country', 'kim', 'science', 'cricket', 'rodeo'
}

# Known URL shortener services
SHORTENERS = {
    'bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'ow.ly', 'buff.ly',
    'cutt.ly', 'rb.gy', 'goo.gl', 'tiny.cc', 'shorturl.at', 'rebrand.ly', 'bl.ink'
}

def init_db():
    c = sqlite3.connect(DB)
    c.execute('''
        CREATE TABLE IF NOT EXISTS analysis (
            id TEXT PRIMARY KEY,
            kind TEXT,
            value TEXT,
            verdict TEXT,
            score INTEGER,
            risks TEXT,
            created TEXT
        )
    ''')
    # Check if extra columns exist, add if missing
    cursor = c.execute("PRAGMA table_info(analysis)")
    cols = [row[1] for row in cursor.fetchall()]
    if 'risk_level' not in cols:
        c.execute('ALTER TABLE analysis ADD COLUMN risk_level TEXT DEFAULT "LOW"')
    if 'threat_category' not in cols:
        c.execute('ALTER TABLE analysis ADD COLUMN threat_category TEXT DEFAULT "General"')
    if 'metadata' not in cols:
        c.execute('ALTER TABLE analysis ADD COLUMN metadata TEXT DEFAULT "{}"')
    if 'confidence' not in cols:
        c.execute('ALTER TABLE analysis ADD COLUMN confidence INTEGER DEFAULT 85')
    if 'user_email' not in cols:
        c.execute('ALTER TABLE analysis ADD COLUMN user_email TEXT DEFAULT "guest@threatlens.intel"')
    c.commit()
    c.close()

def evaluate_url(url_raw):
    raw = url_raw.strip()
    if not re.match(r'^https?://', raw, re.I):
        raw = 'https://' + raw

    parsed = urllib.parse.urlparse(raw)
    host = (parsed.hostname or '').lower()
    path = parsed.path or '/'
    query = parsed.query or ''
    scheme = parsed.scheme.lower()

    score = 0
    indicators = []
    category = 'Standard Web Domain'

    # --- 1. Machine Learning Probability ---
    ml_prob = 0.5
    clean = re.sub(r'^https?://(www\.)?', '', raw, flags=re.I)
    if vector and model_lr:
        try:
            mat = vector.transform([clean])
            classes = list(model_lr.classes_)
            bad_idx = classes.index('bad') if 'bad' in classes else 0
            ml_prob = float(model_lr.predict_proba(mat)[0][bad_idx])
        except Exception as e:
            print(f"ML Inference error: {e}")

    # --- 2. IP Host Analysis ---
    is_ip = bool(re.match(r'^(?:\d{1,3}\.){3}\d{1,3}$', host))
    if is_ip:
        score += 48
        category = 'Raw IP Credential Harvesting'
        indicators.append({
            'name': 'Direct IP Address Host',
            'severity': 'CRITICAL',
            'score_impact': 48,
            'description': f'Host is a bare IP address ({host}) rather than a registered domain. Legitimate commercial web services use verified DNS domains.'
        })

    # --- 3. Brand Impersonation & Typosquatting Analysis ---
    host_normalized = host
    for k, v in TYPOSQUAT_MAP.items():
        host_normalized = host_normalized.replace(k, v)

    detected_brand = None
    is_official_brand = False
    is_brand_spoof = False

    for brand, legit_domains in BRAND_DIRECTORY.items():
        if brand in host_normalized or brand in host:
            detected_brand = brand
            if any(host == d or host.endswith('.' + d) for d in legit_domains):
                is_official_brand = True
                break
            else:
                is_brand_spoof = True
                break

    if is_official_brand:
        category = 'Verified Official Brand Domain'
        indicators.append({
            'name': f'Official {detected_brand.capitalize()} Domain Verified',
            'severity': 'SAFE',
            'score_impact': -45,
            'description': f'Domain {host} is verified as the official authoritative web property for {detected_brand.capitalize()}.'
        })
    elif is_brand_spoof:
        score += 55
        category = 'Brand Impersonation Phishing'
        indicators.append({
            'name': f'Targeted Brand Impersonation ({detected_brand.capitalize()})',
            'severity': 'CRITICAL',
            'score_impact': 55,
            'description': f'Unauthorized external host exploits the trademarked brand "{detected_brand.capitalize()}" to mislead and harvest credentials.'
        })

    # --- 4. URL Shortener Masking ---
    is_shortener = host in SHORTENERS
    if is_shortener:
        score += 32
        if category == 'Standard Web Domain':
            category = 'Destination Masking (URL Shortener)'
        indicators.append({
            'name': 'URL Shortener Redirection Mask',
            'severity': 'MEDIUM',
            'score_impact': 32,
            'description': f'{host} is an URL shortening redirector that conceals the ultimate landing destination from the visitor.'
        })

    # --- 5. Suspicious / High-Abuse TLD ---
    tld = host.split('.')[-1] if '.' in host else ''
    if tld in SUSPICIOUS_TLDS and not is_official_brand:
        score += 26
        indicators.append({
            'name': f'High-Risk Disposable TLD (.{tld})',
            'severity': 'HIGH' if is_brand_spoof else 'MEDIUM',
            'score_impact': 26,
            'description': f'The .{tld} top-level domain exhibits high abuse rates in automated social engineering and malicious redirect campaigns.'
        })

    # --- 6. Excessive Subdomain Stacking ---
    host_parts = host.split('.')
    subdomains = host_parts[:-2] if not is_ip and len(host_parts) > 2 else []
    subdomain_count = len(subdomains)
    if subdomain_count >= 3 and not is_official_brand:
        score += 26
        indicators.append({
            'name': 'Excessive Subdomain Stacking',
            'severity': 'HIGH',
            'score_impact': 26,
            'description': f'{subdomain_count} subdomain levels detected. Phishing campaigns often nest subdomains to push the authentic root domain out of mobile viewports.'
        })
    elif subdomain_count == 2 and not is_official_brand and ('login' in host or 'secure' in host or 'verify' in host):
        score += 15
        indicators.append({
            'name': 'Deceptive Subdomain Keyword Stacking',
            'severity': 'MEDIUM',
            'score_impact': 15,
            'description': f'Subdomain contains authentication terminology on an unverified root host.'
        })

    # --- 7. Lexical Obfuscation Patterns ---
    if '@' in raw:
        score += 38
        indicators.append({
            'name': 'Basic Auth Redirection Obfuscation (@)',
            'severity': 'CRITICAL',
            'score_impact': 38,
            'description': 'The @ character directs browser authentication to the preceding credentials, surreptitiously routing users to the subsequent host.'
        })

    if '//' in path or 'http' in query.lower() or 'redirect=' in query.lower() or 'url=' in query.lower():
        score += 25
        indicators.append({
            'name': 'Nested Open Redirect Pattern',
            'severity': 'HIGH',
            'score_impact': 25,
            'description': 'URL path or query parameters embed a secondary destination, indicating potential open-redirect abuse.'
        })

    hyphen_count = host.count('-')
    if hyphen_count >= 2 and not is_official_brand:
        score += 16
        indicators.append({
            'name': f'High Hyphenation Density ({hyphen_count} hyphens)',
            'severity': 'MEDIUM',
            'score_impact': 16,
            'description': f'Hostname contains {hyphen_count} hyphens, a standard statistical marker in synthetic phishing domain generation.'
        })

    # Port checking
    if parsed.port and parsed.port not in (80, 443):
        score += 18
        indicators.append({
            'name': f'Non-Standard Web Port (:{parsed.port})',
            'severity': 'MEDIUM',
            'score_impact': 18,
            'description': f'Non-standard web port (:{parsed.port}) specified. Consumer web services typically operate on ports 80/443.'
        })

    # Punycode / Homograph check
    if 'xn--' in host:
        score += 30
        indicators.append({
            'name': 'Punycode / Homograph Lookalike Domain (xn--)',
            'severity': 'HIGH',
            'score_impact': 30,
            'description': 'Internationalized domain name detected. Attackers frequently use Cyrillic or Greek lookalikes to visually spoof trusted brands.'
        })

    # Executable file downloads
    danger_ext = re.search(r'\.(exe|scr|vbs|apk|bat|ps1|iso|dmg|zip|rar)$', path, re.I)
    if danger_ext:
        score += 40
        category = 'Malicious Payload Delivery'
        indicators.append({
            'name': f'Direct Executable/Script Download (.{danger_ext.group(1).lower()})',
            'severity': 'CRITICAL',
            'score_impact': 40,
            'description': f'Direct download link to a high-risk executable or script payload (.{danger_ext.group(1).lower()}).'
        })

    # Non-HTTPS protocol
    if scheme == 'http' and not is_ip:
        score += 10
        indicators.append({
            'name': 'Unencrypted Protocol (HTTP)',
            'severity': 'LOW',
            'score_impact': 10,
            'description': 'Website uses unencrypted HTTP communication. Sensitive credentials can be intercepted via machine-in-the-middle.'
        })

    # --- 8. Credential Harvesting Terminology ---
    cred_keywords = re.findall(r'login|signin|verify|account|banking|security|update|wallet|recover|password|authenticate|confirm|billing|support', path + ' ' + query, re.I)
    if cred_keywords and not is_official_brand:
        score += 22
        indicators.append({
            'name': f'Credential Harvesting Keywords (Found: {", ".join(set(cred_keywords[:3]))})',
            'severity': 'HIGH' if (is_brand_spoof or is_ip) else 'MEDIUM',
            'score_impact': 22,
            'description': f'URL path or query targets user authentication credentials on an unverified domain.'
        })

    # --- 9. Machine Learning Integration & Score Calibration ---
    if not is_official_brand:
        ml_score_contrib = round(ml_prob * 30)
        score += ml_score_contrib
        if ml_prob >= 0.70:
            indicators.append({
                'name': 'ML Lexical Classifier Anomaly',
                'severity': 'HIGH' if ml_prob >= 0.85 else 'MEDIUM',
                'score_impact': ml_score_contrib,
                'description': f'Pre-trained neural/logistic classifier detected token sequence anomalies with {round(ml_prob * 100)}% phishing probability.'
            })
    else:
        # Legitimate brand verified: clamp score to minimal safe values
        score = min(score, 8)

    # Final score calibration (0 to 100)
    final_score = min(99, max(2, score)) if not is_official_brand else min(10, max(2, score))

    # Determine Differentiated Risk Tier & Actionable Recommendations
    if final_score >= 80:
        risk_level = 'CRITICAL'
        verdict = 'Critical Phishing Threat Detected'
        recommendation = '⛔ IMMEDIATE BLOCK: Critical threat detected. Host demonstrates active credential theft, brand masquerading, or malicious payload distribution. Block at firewall and do NOT navigate.'
    elif final_score >= 65:
        risk_level = 'HIGH'
        verdict = 'High Risk Phishing Activity'
        recommendation = '🚨 DANGER: High probability of phishing. Do not input credentials, passwords, or personal identity details. Inspect domain authenticity.'
    elif final_score >= 35:
        risk_level = 'MODERATE'
        verdict = 'Suspicious / Elevated Risk'
        if category == 'Standard Web Domain':
            category = 'Suspicious Domain Heuristics'
        recommendation = '⚠️ CAUTION ADVISED: Suspicious traits detected (masked destination, unusual TLD, or high lexical entropy). Manually verify the true landing address before proceeding.'
    else:
        risk_level = 'LOW'
        verdict = 'Verified Legitimate / Safe Web Domain'
        recommendation = '✅ SAFE WEB RESOURCE: No deceptive heuristic markers or phishing vectors observed. Standard safe browsing practices apply.'
        if not indicators:
            indicators.append({
                'name': 'Clean Lexical & Domain Reputation',
                'severity': 'SAFE',
                'score_impact': 0,
                'description': 'No phishing heuristics, brand spoofing, or deceptive redirection signatures observed.'
            })

    confidence = round(max(ml_prob, 1 - ml_prob) * 100) if not is_official_brand else 98
    confidence = max(80, min(99, confidence))

    metadata = {
        'host': host,
        'tld': tld,
        'scheme': scheme,
        'is_ip': is_ip,
        'subdomain_count': subdomain_count,
        'is_shortener': is_shortener,
        'has_https': scheme == 'https',
        'is_official_brand': is_official_brand,
        'is_brand_spoof': is_brand_spoof,
        'detected_brand': detected_brand,
        'ml_probability': round(ml_prob * 100, 1),
        'recommendation': recommendation
    }

    return {
        'score': final_score,
        'risk_level': risk_level,
        'verdict': verdict,
        'threat_category': category,
        'confidence': confidence,
        'indicators': indicators,
        'metadata': metadata,
        'engine': 'ThreatLens AI Dual Engine (ML Logistic Regression + Real-time Lexical Heuristics)'
    }

def evaluate_message(text, kind):
    raw = text.strip()
    score = 0
    indicators = []
    category = f"{kind.upper()} Social Engineering"

    # Social engineering rules
    rules = [
        (
            r'urgent|act now|immediately|final warning|suspend|within 24 hours|account frozen|legal action|law enforcement|arrest warrant|penalty',
            'Coercive Urgency Pressure',
            'HIGH',
            28,
            'The message manufactures artificial urgency to bypass logical evaluation and coerce hasty user action.'
        ),
        (
            r'password|otp|one.?time code|verify.*account|bank details|card number|pin code|cvv|security code|social security|ssn',
            'Credential / 2FA Secret Solicitation',
            'CRITICAL',
            38,
            'Direct request for sensitive credentials, PINs, or one-time verification passwords. Reputable organizations never solicit passwords via unprompted messages.'
        ),
        (
            r'prize|lottery|winner|refund|gift card|crypto|bitcoin|free money|cash bonus|inheritance|tax rebate|unclaimed',
            'Advance-Fee & Financial Bait',
            'HIGH',
            28,
            'Offers unearned financial windfalls, lottery jackpots, or rebates, a classic advance-fee social engineering lure.'
        ),
        (
            r'usps|fedex|dhl|package.*delivery|undelivered|customs fee|redelivery|parcel',
            'Delivery Impersonation (Smishing Lure)',
            'HIGH',
            26,
            'Impersonates courier logistics claiming undelivered packages, requiring small fee payment or identity confirmation.'
        ),
        (
            r'internal revenue service|irs|federal bureau|fraud prevention|it helpdesk|security team|geek squad|norton',
            'Authority Impersonation',
            'HIGH',
            25,
            'Spoofs corporate or government authority to intimidate recipients into compliance.'
        ),
        (
            r'https?://|www\.|bit\.ly|tinyurl\.com|t\.co',
            'Embedded External Link',
            'MEDIUM',
            18,
            'Message contains a hyperlinked destination. Cross-check sender provenance before opening links in unsolicited messages.'
        ),
        (
            r'dear customer|dear user|kindly|valued client',
            'Generic Mass-Phishing Salutation',
            'LOW',
            10,
            'Generic salutation indicates mass-targeted, automated social engineering outreach.'
        )
    ]

    for pattern, title, severity, impact, detail in rules:
        if re.search(pattern, raw, re.I):
            indicators.append({
                'name': title,
                'severity': severity,
                'score_impact': impact,
                'description': detail
            })
            score += impact

    final_score = min(99, max(5, score)) if indicators else 8

    if final_score >= 75:
        risk_level = 'CRITICAL'
        verdict = f'High Threat Phishing / Fraud {kind.upper()}'
        recommendation = '⛔ DO NOT ENGAGE: Malicious social engineering detected. Do not click links, provide OTP codes, or dial provided telephone numbers. Delete and report as spam.'
    elif final_score >= 40:
        risk_level = 'MODERATE'
        verdict = f'Suspicious / Potential Fraud {kind.upper()}'
        recommendation = '⚠️ CAUTION: Unverified communication exhibiting pressure tactics or unsolicited links. Contact the institution via their official phone number or website directly.'
    else:
        risk_level = 'LOW'
        verdict = f'Low Risk / Standard {kind.upper()}'
        recommendation = '✅ SAFE: No aggressive coercive tactics or credential harvesting indicators observed.'
        if not indicators:
            indicators.append({
                'name': 'No Malicious Indicators Observed',
                'severity': 'SAFE',
                'score_impact': 0,
                'description': 'Text exhibits standard communicative structure without urgency extortion or sensitive credential harvesting.'
            })

    confidence = min(95, 55 + len(indicators) * 10)

    metadata = {
        'length': len(raw),
        'word_count': len(raw.split()),
        'recommendation': recommendation
    }

    return {
        'score': final_score,
        'risk_level': risk_level,
        'verdict': verdict,
        'threat_category': category,
        'confidence': confidence,
        'indicators': indicators,
        'metadata': metadata,
        'engine': f'ThreatLens Explainable {kind.upper()} NLP Threat Analyzer'
    }

def save_analysis(kind, value, verdict, score, risk_level, threat_category, confidence, indicators, metadata, user_email='guest@threatlens.intel'):
    scan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clean_email = (user_email or 'guest@threatlens.intel').strip().lower()
    c = sqlite3.connect(DB)
    c.execute(
        'INSERT INTO analysis (id, kind, value, verdict, score, risk_level, threat_category, confidence, risks, metadata, user_email, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        (
            scan_id,
            kind,
            value,
            verdict,
            score,
            risk_level,
            threat_category,
            confidence,
            json.dumps(indicators),
            json.dumps(metadata),
            clean_email,
            now
        )
    )
    c.commit()
    c.close()
    return scan_id, now

# --- API Endpoints ---

@app.post('/api/analyze/<kind>')
def analyze_endpoint(kind):
    data = request.get_json() or {}
    value = data.get('value', '').strip()
    user_email = (data.get('user_email') or '').strip().lower() or 'guest@threatlens.intel'
    if not value:
        return jsonify(error='Please provide content to analyze.'), 400

    if kind == 'url':
        result = evaluate_url(value)
    elif kind in ('email', 'sms'):
        result = evaluate_message(value, kind)
    else:
        return jsonify(error=f'Unsupported analysis kind "{kind}". Supported: url, email, sms.'), 404

    scan_id, created = save_analysis(
        kind=kind,
        value=value,
        verdict=result['verdict'],
        score=result['score'],
        risk_level=result['risk_level'],
        threat_category=result['threat_category'],
        confidence=result['confidence'],
        indicators=result['indicators'],
        metadata=result['metadata'],
        user_email=user_email
    )

    return jsonify(
        id=scan_id,
        kind=kind,
        value=value,
        verdict=result['verdict'],
        risk_score=result['score'],
        risk_level=result['risk_level'],
        threat_category=result['threat_category'],
        confidence=result['confidence'],
        risks=result['indicators'],
        metadata=result['metadata'],
        user_email=user_email,
        engine=result['engine'],
        limitation='Risk scores are real-time threat intelligence decision support, not legal proof of fraud or immunity.',
        created=created
    ), 201

@app.get('/api/dashboard')
def dashboard_endpoint():
    user = request.args.get('user', '').strip().lower()
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    if user:
        rows = [dict(x) for x in c.execute('SELECT * FROM analysis WHERE user_email = ? ORDER BY created DESC', (user,))]
    else:
        rows = [dict(x) for x in c.execute('SELECT * FROM analysis ORDER BY created DESC')]
    c.close()

    total = len(rows)
    critical = sum(1 for x in rows if (x.get('score') or 0) >= 80)
    high = sum(1 for x in rows if 65 <= (x.get('score') or 0) < 80)
    moderate = sum(1 for x in rows if 35 <= (x.get('score') or 0) < 65)
    low = sum(1 for x in rows if (x.get('score') or 0) < 35)

    recent_formatted = []
    for r in rows[:20]:
        try:
            risks_parsed = json.loads(r.get('risks', '[]'))
        except:
            risks_parsed = []
        try:
            metadata_parsed = json.loads(r.get('metadata', '{}'))
        except:
            metadata_parsed = {}

        recent_formatted.append({
            'id': r['id'],
            'kind': r['kind'],
            'value': r['value'],
            'verdict': r['verdict'],
            'score': r['score'],
            'risk_level': r.get('risk_level') or ('HIGH' if r['score'] >= 70 else 'MODERATE' if r['score'] >= 40 else 'LOW'),
            'threat_category': r.get('threat_category') or 'General',
            'confidence': r.get('confidence') or 85,
            'risks': risks_parsed,
            'metadata': metadata_parsed,
            'user_email': r.get('user_email') or 'guest@threatlens.intel',
            'created': r['created']
        })

    return jsonify(
        total=total,
        critical=critical,
        high=high,
        moderate=moderate,
        low=low,
        suspicious=moderate + high, # backwards compat
        lower=low, # backwards compat
        recent=recent_formatted,
        breakdown={
            'url': sum(1 for x in rows if x.get('kind') == 'url'),
            'email': sum(1 for x in rows if x.get('kind') == 'email'),
            'sms': sum(1 for x in rows if x.get('kind') == 'sms')
        }
    )

@app.get('/api/scan/<scan_id>')
def get_scan(scan_id):
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    row = c.execute('SELECT * FROM analysis WHERE id = ?', (scan_id,)).fetchone()
    c.close()
    if not row:
        return jsonify(error='Scan record not found.'), 404
    r = dict(row)
    try:
        r['risks'] = json.loads(r.get('risks', '[]'))
    except:
        r['risks'] = []
    try:
        r['metadata'] = json.loads(r.get('metadata', '{}'))
    except:
        r['metadata'] = {}
    return jsonify(r)

@app.delete('/api/scan/<scan_id>')
def delete_scan(scan_id):
    c = sqlite3.connect(DB)
    c.execute('DELETE FROM analysis WHERE id = ?', (scan_id,))
    c.commit()
    c.close()
    return jsonify(success=True)

@app.get('/api/health')
def health_endpoint():
    return jsonify(
        status='ok',
        platform='ThreatLens AI Cyber Threat Intelligence',
        version='3.5.0',
        model_lr_loaded=model_lr is not None,
        model_mnb_loaded=model_mnb is not None
    )

# Static file serving for production build
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    dist_dir = ROOT / 'frontend' / 'dist'
    if dist_dir.exists() and (dist_dir / 'index.html').exists():
        if path and (dist_dir / path).exists():
            return send_from_directory(str(dist_dir), path)
        return send_from_directory(str(dist_dir), 'index.html')
    return jsonify(
        status='ThreatLens Backend API Running',
        dev_frontend='http://localhost:5173',
        endpoints=['/api/health', '/api/dashboard', '/api/analyze/url', '/api/analyze/email', '/api/analyze/sms']
    )

if __name__ == '__main__':
    init_db()
    print("ThreatLens AI Threat Intelligence Backend running on http://127.0.0.1:8000")
    app.run(host='127.0.0.1', port=8000, debug=False)
else:
    init_db()
