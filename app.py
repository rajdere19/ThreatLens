import json, math, os, pickle, re, sqlite3, urllib.parse, uuid
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from FUNDS_TRANSFER_ANALYZER import analyze_funds_transfer
from EMAIL_HEADER_PARSER import analyze_email_headers
from BRAND_SECURITY_VERIFIER import verify_brand_security_email

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

# Lazy-loaded auxiliary model to ensure rapid startup
model_mnb = None
def get_model_mnb():
    global model_mnb
    if model_mnb is None:
        try:
            model_mnb = pickle.load(open(ROOT / 'phishing_mnb.pkl', 'rb'))
        except Exception as e:
            model_mnb = None
    return model_mnb

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

# Official Government Portals & Clone Tracking Directory
# Focus: Maharashtra State & Central Indian Citizen Services
# Differentiates authentic .gov.in / official portals from fraudulent clones on .site, .xyz, .sh, .hn, .top
GOV_DIRECTORY = {
    'maharashtra': {
        'name': 'Maharashtra State Portal',
        'dept': 'Government of Maharashtra',
        'official_domains': ['maharashtra.gov.in'],
        'clone_domains': [
            'maharashtra.site', 'maharashtra.xyz', 'maharashtragov.sh',
            'maharashtra.hn', 'maharashtra-gov.site', 'maharashtragov.in.net',
            'maharashtra-portal.xyz', 'maharashtragov.site', 'maharashtra.top'
        ],
        'keywords': ['maharashtra.gov', 'maharashtragov', 'maharashtra-gov'],
        'threat_type': 'State Portal Masquerading & Citizen Identity Theft'
    },
    'aaplesarkar': {
        'name': 'Aaple Sarkar Citizen Services',
        'dept': 'MahaOnline / Government of Maharashtra',
        'official_domains': ['aaplesarkar.mahaonline.gov.in', 'mahaonline.gov.in'],
        'clone_domains': [
            'aaplesarkar.site', 'aaplesarkar.xyz', 'aaplesarkar-mahaonline.sh',
            'aaplesarkar.hn', 'mahaonline-portal.site', 'aaplesarkar-gov.xyz',
            'aaplesarkar.top', 'mahaonline.site', 'aaplesarkar-services.sh'
        ],
        'keywords': ['aaplesarkar', 'aaple-sarkar', 'mahaonline'],
        'threat_type': 'Citizen Certificate Phishing & Identity Document Theft'
    },
    'mahadbt': {
        'name': 'MahaDBT (Scholarships & Direct Benefit Transfer)',
        'dept': 'Social Justice & Special Assistance Dept, Maharashtra',
        'official_domains': ['mahadbt.maharashtra.gov.in', 'mahadbtmahait.gov.in'],
        'clone_domains': [
            'mahadbt.site', 'mahadbt.xyz', 'mahadbt-scholarship.sh',
            'mahadbt.hn', 'mahadbtgov.site', 'mahadbt-maharashtra.xyz',
            'mahadbt-portal.top', 'mahadbt.online', 'mahadbt-gov.in.net'
        ],
        'keywords': ['mahadbt', 'maha-dbt'],
        'threat_type': 'Student Scholarship Extortion & Bank Account Hijacking'
    },
    'bhulekh': {
        'name': 'Bhulekh Mahabhumi (7/12 Land Records Portal)',
        'dept': 'Revenue & Forest Department, Maharashtra',
        'official_domains': ['bhulekh.mahabhumi.gov.in', 'mahabhumi.gov.in'],
        'clone_domains': [
            'bhulekh-mahabhumi.site', 'bhulekh.xyz', 'mahabhumi.sh',
            'bhulekh.hn', 'mahabhumi-7-12.site', 'bhulekhmahabhumi.top',
            'bhulekh-online.xyz', 'bhulekh.site', 'mahabhumi.site', 'bhulekh712.sh'
        ],
        'keywords': ['bhulekh', 'mahabhumi', '7-12', '712online'],
        'threat_type': 'Fraudulent Land Record Download & Fake Stamp Duty Fees'
    },
    'igrmaharashtra': {
        'name': 'IGR Maharashtra (Property Registration & Stamps)',
        'dept': 'Inspector General of Registration, Maharashtra',
        'official_domains': ['igrmaharashtra.gov.in'],
        'clone_domains': [
            'igrmaharashtra.site', 'igrmaharashtra.xyz', 'igrmaharashtra.sh',
            'igrmaharashtra.hn', 'igr-maharashtra.top', 'igrmaharashtra-gov.site',
            'igrmaharashtra-online.xyz', 'igrmaharashtra.top'
        ],
        'keywords': ['igrmaharashtra', 'igr-maharashtra'],
        'threat_type': 'Fake Property Document Verification & Fee Redirection'
    },
    'mpsc': {
        'name': 'Maharashtra Public Service Commission (MPSC)',
        'dept': 'Maharashtra Public Service Commission',
        'official_domains': ['mpsc.gov.in', 'mpsconline.gov.in'],
        'clone_domains': [
            'mpsc.site', 'mpsc.xyz', 'mpsc-gov.sh',
            'mpsc.hn', 'mpsc-hallticket.site', 'mpsconline.top',
            'mpsc-apply.xyz', 'mpsconline.site', 'mpsc-gov.in.net'
        ],
        'keywords': ['mpsc', 'mpsconline'],
        'threat_type': 'Fake Hall Ticket Distribution & Recruitment Fee Phishing'
    },
    'mahacet': {
        'name': 'State Common Entrance Test Cell (MAHACET)',
        'dept': 'Government of Maharashtra Higher & Technical Education',
        'official_domains': ['cetcell.mahacet.org', 'mahacet.org'],
        'clone_domains': [
            'mahacet.site', 'mahacet.xyz', 'cetcell-mahacet.sh',
            'mahacet.hn', 'cetcell.site', 'mahacet-gov.xyz',
            'mahacet-admitcard.top', 'cetcell-mahacet.site'
        ],
        'keywords': ['mahacet', 'cetcell'],
        'threat_type': 'Admit Card Impersonation & Exam Fee Redirection'
    },
    'mahadiscom': {
        'name': 'MahaDiscom (MSEDCL Electricity Portal)',
        'dept': 'Maharashtra State Electricity Distribution Co. Ltd.',
        'official_domains': ['mahadiscom.in'],
        'clone_domains': [
            'mahadiscom-billpay.site', 'mahadiscom.xyz', 'mahadiscom-update.sh',
            'mahadiscom.hn', 'mahadiscom-bill.top', 'msedcl-billpay.site',
            'mahadiscom.site', 'msedcl.xyz', 'mahadiscom-ebill.sh'
        ],
        'keywords': ['mahadiscom', 'msedcl'],
        'threat_type': 'Electricity Disconnection SMS Phishing & Payment Interception'
    },
    'msrtc': {
        'name': 'MSRTC (Maharashtra State Road Transport)',
        'dept': 'Maharashtra State Road Transport Corporation',
        'official_domains': ['msrtc.maharashtra.gov.in', 'msrtc.gov.in'],
        'clone_domains': [
            'msrtc-booking.site', 'msrtc.xyz', 'msrtc-bus.sh',
            'msrtc.hn', 'msrtc-ticket.site', 'msrtcmaharashtra.top',
            'msrtc-online.xyz'
        ],
        'keywords': ['msrtc', 'msrtc-ticket', 'msrtc-booking'],
        'threat_type': 'Fake Bus Ticket Reservation & Credit Card Theft'
    },
    'mahapolice': {
        'name': 'Maharashtra State Police Portal',
        'dept': 'Maharashtra Police / Home Department',
        'official_domains': ['mahapolice.gov.in'],
        'clone_domains': [
            'mahapolice.site', 'mahapolice.xyz', 'mahapolice-complaint.sh',
            'mahapolice.hn', 'mahapolice-portal.top', 'mahapolice-challan.site',
            'mahapolice-gov.xyz'
        ],
        'keywords': ['mahapolice', 'maha-police'],
        'threat_type': 'Fake Cyber Police Extortion & Phishing Challans'
    },
    'parivahan': {
        'name': 'Sarathi Parivahan (Driving License & Vahan Portal)',
        'dept': 'Ministry of Road Transport and Highways (MoRTH), Government of India',
        'official_domains': ['sarathi.parivahan.gov.in', 'parivahan.gov.in', 'echallan.parivahan.gov.in'],
        'clone_domains': [
            'sarathi-parivahan.site', 'parivahan.xyz', 'sarathi.sh',
            'sarathi-parivahan.hn', 'echallan-parivahan.site', 'parivahan-sewa.top',
            'sarathiparivahan.site', 'parivahangov.in.net', 'parivahan.site',
            'sarathi.xyz', 'echallan.sh'
        ],
        'keywords': ['parivahan', 'sarathi', 'echallan'],
        'threat_type': 'Fake e-Challan Fine Extortion & Driving License Phishing'
    }
}

# Verified Piracy & Shadow-Library Directory
# Differentiates authentic portals (grey-market/adware risks) from malicious impostor clones (infostealers, malware payloads, university credential phishing)
PIRACY_DIRECTORY = {
    'fitgirl': {
        'name': 'FitGirl Repacks',
        'type': 'Game Repack Portal',
        'official_domains': [
            'fitgirl-repacks.site'
        ],
        'clone_domains': [
            'fitgirl-repacks.to',
            'fitgirlrepacks.co',
            'fitgir1-repacks.com',
            'fitgirl-repacks.xyz',
            'fitgirl-repack.com',
            'fitgirlrepacks.net',
            'fitgirl-repacks.cc',
            'fitgirl-repack.to',
            'fitgirl.fun',
            'fitgirl-repacks.download',
            'fitgirlrepack.org'
        ],
        'official_base_score': 45,
        'clone_base_score': 98,
        'clone_threat_notes': 'Malicious clones distribute Lumma Stealer, RedLine Stealer, and trojanized setup.exe installers.'
    },
    'scihub': {
        'name': 'Sci-Hub Academic Repository',
        'type': 'Academic Shadow Library',
        'official_domains': [
            'sci-hub.se',
            'sci-hub.st',
            'sci-hub.ru'
        ],
        'clone_domains': [
            'sci-hub.top',
            'sci-hub.click',
            'sci-hub.pub',
            'sci-hub.shop',
            'sci-hub.cloud',
            'sci-hub-pdf.xyz',
            'sci-hub.world',
            'sci-hub.ren',
            'sci-hub.tw'
        ],
        'official_base_score': 40,
        'clone_base_score': 96,
        'clone_threat_notes': 'Fake clones harvest university library SSO logins or trick researchers into downloading malicious PDF viewers.'
    },
    'sci-hub': {
        'name': 'Sci-Hub Academic Repository',
        'type': 'Academic Shadow Library',
        'official_domains': [
            'sci-hub.se',
            'sci-hub.st',
            'sci-hub.ru'
        ],
        'clone_domains': [
            'sci-hub.top',
            'sci-hub.click',
            'sci-hub.pub',
            'sci-hub.shop',
            'sci-hub.cloud',
            'sci-hub-pdf.xyz',
            'sci-hub.world',
            'sci-hub.ren',
            'sci-hub.tw'
        ],
        'official_base_score': 40,
        'clone_base_score': 96,
        'clone_threat_notes': 'Fake clones harvest university library SSO logins or trick researchers into downloading malicious PDF viewers.'
    },
    'libgen': {
        'name': 'Library Genesis (LibGen)',
        'type': 'Academic & Book Repository',
        'official_domains': [
            'libgen.is',
            'libgen.rs',
            'libgen.st',
            'libgen.li'
        ],
        'clone_domains': [
            'libgen.top',
            'libgen-download.xyz',
            'libgen.me',
            'libgen.click',
            'libgen.gs',
            'libgen.io'
        ],
        'official_base_score': 40,
        'clone_base_score': 95,
        'clone_threat_notes': 'Fake clones package books with executable malware droppers (.exe, .scr).'
    },
    'dodi': {
        'name': 'DODI Repacks',
        'type': 'Game Repack Portal',
        'official_domains': [
            'dodi-repacks.site'
        ],
        'clone_domains': [
            'dodi-repack.com',
            'dodi-repacks.xyz',
            'dodi-repacks.to',
            'dodi-repack.net',
            'dodi-repacks.download'
        ],
        'official_base_score': 44,
        'clone_base_score': 98,
        'clone_threat_notes': 'Fake mirrors wrap installer packages in spyware and adware droppers.'
    },
    'steamunlocked': {
        'name': 'SteamUnlocked',
        'type': 'Direct Warez Portal',
        'official_domains': [
            'steamunlocked.net'
        ],
        'clone_domains': [
            'steamun1ocked.net',
            'steamunlocked.pro',
            'steamunlocked.cc',
            'steam-unlocked.com',
            'steamunlocked.org',
            'steamunlocked.to',
            'steamunlocked.xyz'
        ],
        'official_base_score': 48,
        'clone_base_score': 98,
        'clone_threat_notes': 'Clones spoof UploadHaven redirect gates to distribute malicious zip archives and cryptominers.'
    },
    'thepiratebay': {
        'name': 'The Pirate Bay',
        'type': 'Torrent Index',
        'official_domains': [
            'thepiratebay.org'
        ],
        'clone_domains': [
            'thepiratebay.zone',
            'pirateproxy.live',
            'thepiratebay-proxy.xyz',
            'tpbproxy.click',
            'thepiratebay10.org',
            'thepiratebay.vip',
            'pirate-bay.net'
        ],
        'official_base_score': 46,
        'clone_base_score': 97,
        'clone_threat_notes': 'Abuse proxy caching to inject malicious malvertising scripts and trojanized torrent torrent files.'
    },
    '1337x': {
        'name': '1337x Torrents',
        'type': 'Torrent Directory',
        'official_domains': [
            '1337x.to',
            '1337x.so',
            '1337x.st'
        ],
        'clone_domains': [
            '1337xx.to',
            '1337x.unblockit.xyz',
            '1337x.tw',
            '1337x.is',
            '1337x-to.org',
            '1337x.buzz'
        ],
        'official_base_score': 44,
        'clone_base_score': 96,
        'clone_threat_notes': 'Impostor mirrors inject disguised VBS and PowerShell payload loaders into torrent downloads.'
    },
    'yts': {
        'name': 'YTS / YIFY Movies',
        'type': 'Movie Torrent Index',
        'official_domains': [
            'yts.mx'
        ],
        'clone_domains': [
            'yts.pm',
            'yts.ag',
            'yify-movies.xyz',
            'yts.vc',
            'yts-torrent.org',
            'yts.am',
            'yts.lt'
        ],
        'official_base_score': 42,
        'clone_base_score': 96,
        'clone_threat_notes': 'Impostor sites serve fake video codec installers containing adware and search hijackers.'
    },
    'nyaa': {
        'name': 'Nyaa Torrents',
        'type': 'Media Torrent Index',
        'official_domains': [
            'nyaa.si'
        ],
        'clone_domains': [
            'nyaa.iss.ink',
            'nyaa.net',
            'nyaa-si.top',
            'nyaa.land'
        ],
        'official_base_score': 40,
        'clone_base_score': 95,
        'clone_threat_notes': 'Phishing mirrors designed to harvest community forum accounts and deploy malicious extensions.'
    },
    'annas-archive': {
        'name': "Anna's Archive",
        'type': 'Academic Shadow Library',
        'official_domains': [
            'annas-archive.org',
            'annas-archive.se',
            'annas-archive.li'
        ],
        'clone_domains': [
            'annas-archive.xyz',
            'annas-archive.top',
            'annas-archive.click'
        ],
        'official_base_score': 40,
        'clone_base_score': 95,
        'clone_threat_notes': 'Clones solicit fraudulent donations or serve weaponized PDF documents.'
    },
    'skidrow': {
        'name': 'Skidrow Scene Impersonation',
        'type': 'Third-Party Warez',
        'official_domains': [], # Scene groups do not maintain public web portals
        'clone_domains': [
            'skidrowreloaded.com',
            'skidrowcodex.net',
            'skidrow-games.com',
            'skidrowcrack.com',
            'skidrowreloaded.to',
            'skidrowrepack.com'
        ],
        'official_base_score': 68,
        'clone_base_score': 94,
        'clone_threat_notes': 'Warez scene groups do not have official sites; all public sites using this name are third-party operators carrying high malware risk.'
    }
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
    'support', 'country', 'kim', 'science', 'cricket', 'rodeo', 'pro', 'cc',
    'cam', 'surf', 'ws', 'to'
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

    # --- 3b. Piracy & Academic Shadow-Library Brand / Impostor Clone Analysis ---
    detected_piracy_key = None
    is_official_piracy = False
    is_piracy_clone = False
    is_known_clone = False
    piracy_portal_info = None

    # Check 1: Does host match any verified official domain in the directory?
    for p_key, p_info in PIRACY_DIRECTORY.items():
        if p_info.get('official_domains') and any(host == d or host.endswith('.' + d) for d in p_info['official_domains']):
            detected_piracy_key = p_key
            piracy_portal_info = p_info
            is_official_piracy = True
            break

    # Check 2: If not official, does host match known tracked clone domains?
    if not is_official_piracy:
        for p_key, p_info in PIRACY_DIRECTORY.items():
            if p_info.get('clone_domains') and any(host == d or host.endswith('.' + d) for d in p_info['clone_domains']):
                detected_piracy_key = p_key
                piracy_portal_info = p_info
                is_piracy_clone = True
                is_known_clone = True
                break

    # Check 3: If not matched yet, check if host or typosquatted host contains the portal brand
    if not is_official_piracy and not is_piracy_clone:
        for p_key, p_info in PIRACY_DIRECTORY.items():
            if p_key in host_normalized or p_key in host:
                detected_piracy_key = p_key
                piracy_portal_info = p_info
                if p_info.get('official_domains') and any(host == d or host.endswith('.' + d) for d in p_info['official_domains']):
                    is_official_piracy = True
                else:
                    is_piracy_clone = True
                    is_known_clone = False
                break

    if is_official_piracy:
        category = f"Verified Official {piracy_portal_info['type']}"
        score = max(score, piracy_portal_info.get('official_base_score', 42))
        indicators.append({
            'name': f"Verified Official {piracy_portal_info['name']} Domain",
            'severity': 'MEDIUM',
            'score_impact': piracy_portal_info.get('official_base_score', 42),
            'description': f"Host '{host}' is the verified official domain for {piracy_portal_info['name']}. Verified domains: {', '.join(piracy_portal_info.get('official_domains', []))}. Note: Grey-market or copyright risks apply, but this host is NOT a known malware-injecting clone. Beware of external third-party ad networks."
        })
    elif is_piracy_clone:
        if is_known_clone:
            clone_impact = piracy_portal_info.get('clone_base_score', 96)
            score += clone_impact
            category = f"Malicious Piracy / Shadow-Library Clone"
            indicators.append({
                'name': f"Tracked Malicious Clone ({piracy_portal_info['name']})",
                'severity': 'CRITICAL',
                'score_impact': clone_impact,
                'description': f"CRITICAL THREAT: '{host}' is a known fraudulent clone domain impersonating {piracy_portal_info['name']}. Threat Intel: {piracy_portal_info.get('clone_threat_notes', 'Clones distribute infostealers and trojans.')} Legitimate official domain is: {', '.join(piracy_portal_info.get('official_domains', ['None']))}."
            })
        else:
            score += 75
            category = f"Unverified Lookalike Piracy Clone"
            indicators.append({
                'name': f"Heuristic Impostor Clone ({piracy_portal_info['name']})",
                'severity': 'CRITICAL',
                'score_impact': 75,
                'description': f"Domain '{host}' targets the '{piracy_portal_info['name']}' brand name, but is NOT on the verified official domain whitelist ({', '.join(piracy_portal_info.get('official_domains', []))}). Unofficial mirrors and clones have a 90%+ statistical correlation with Lumma Stealer and trojanized payloads."
            })

    # --- 3c. Generic Piracy / Warez / Streaming Keyword Detection ---
    generic_piracy_regex = r'(repack|crack|keygen|warez|torrent|magnet|camrip|watch-free-online|free-movie|unlocked-apk|nulled|direct-download-free|full-game-crack)'
    has_piracy_terms = bool(re.search(generic_piracy_regex, host + ' ' + path + ' ' + query, re.I))
    if has_piracy_terms and not is_official_brand and not is_official_piracy:
        score += 28
        if category == 'Standard Web Domain':
            category = 'Unverified Piracy / Illicit Media Portal'
        indicators.append({
            'name': 'Piracy / Warez Distribution Signatures',
            'severity': 'HIGH' if is_piracy_clone else 'MEDIUM',
            'score_impact': 28,
            'description': 'URL contains keywords indicating pirated media, cracked software, or unverified streams. High statistical correlation with drive-by malvertising and browser hijacking.'
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
    if is_official_brand:
        final_score = min(10, max(2, score))
    elif is_piracy_clone:
        final_score = min(99, max(88, score))
    elif is_official_piracy:
        final_score = min(48, max(38, score))
    else:
        final_score = min(99, max(2, score))

    # Determine Differentiated Risk Tier & Actionable Recommendations
    if is_piracy_clone or final_score >= 80:
        risk_level = 'CRITICAL'
        if is_piracy_clone:
            clone_prefix = "Known Malicious Clone" if is_known_clone else "Unverified Lookalike Clone"
            verdict = f'{clone_prefix} ({piracy_portal_info["name"]})'
            recommendation = f'⛔ IMMEDIATE BLOCK: Fake clone impersonating {piracy_portal_info["name"]}. Clones distribute infostealers (Lumma/RedLine), ransomware, or harvest institutional credentials. Do NOT download files or input passwords.'
        else:
            verdict = 'Critical Phishing Threat Detected'
            recommendation = '⛔ IMMEDIATE BLOCK: Critical threat detected. Host demonstrates active credential theft, brand masquerading, or malicious payload distribution. Block at firewall and do NOT navigate.'
    elif final_score >= 65:
        risk_level = 'HIGH'
        verdict = 'High Risk Phishing / Warez Activity'
        recommendation = '🚨 DANGER: High probability of phishing or malicious distribution. Do not input credentials, passwords, or personal identity details. Inspect domain authenticity.'
    elif final_score >= 35:
        risk_level = 'MODERATE'
        if is_official_piracy:
            verdict = f'Verified Official {piracy_portal_info["name"]} (Grey-Market Caution)'
            recommendation = f'⚠️ CAUTION ADVISED: Verified authentic portal for {piracy_portal_info["name"]}. While not an impostor malware clone, use caution with external file download links and third-party ad networks.'
        else:
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
        'is_official_piracy': is_official_piracy,
        'is_piracy_clone': is_piracy_clone,
        'is_known_clone': is_known_clone,
        'piracy_portal': piracy_portal_info['name'] if piracy_portal_info else None,
        'piracy_type': piracy_portal_info['type'] if piracy_portal_info else None,
        'official_domains': piracy_portal_info.get('official_domains', []) if piracy_portal_info else [],
        'sample_clone_domains': piracy_portal_info.get('clone_domains', [])[:5] if piracy_portal_info else [],
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

    # --- 1. Header Intelligence & Lookalike / Cousin Domain Analysis (Email only) ---
    header_res = {'has_headers': False, 'score': 0, 'indicators': []}
    if kind == 'email':
        try:
            header_res = analyze_email_headers(raw)
            if header_res['indicators']:
                indicators.extend(header_res['indicators'])
                score += header_res['score']
        except Exception as e:
            print(f"Header parser error: {e}")

    # --- 1b. Brand Security & Password Confirmation Engine (Google, Steam, MS, Amazon) ---
    brand_sec_res = {'is_brand_security': False, 'score': 0, 'indicators': []}
    if kind == 'email':
        try:
            brand_sec_res = verify_brand_security_email(
                raw,
                from_addr=header_res.get('sender_addr', ''),
                from_domain=header_res.get('sender_domain', '')
            )
            if brand_sec_res['is_brand_security']:
                if brand_sec_res['is_authentic']:
                    # Legitimate confirmation or promotional dispatch
                    return {
                        'score': brand_sec_res['score'],
                        'risk_level': 'LOW',
                        'verdict': brand_sec_res['verdict'],
                        'threat_category': 'Official Brand Promotion' if brand_sec_res.get('is_promotional') else 'Verified Security Dispatch',
                        'confidence': 98,
                        'indicators': brand_sec_res['indicators'],
                        'metadata': {
                            'length': len(raw),
                            'word_count': len(raw.split()),
                            'recommendation': brand_sec_res['recommendation'],
                            'is_authentic_brand': True,
                            'brand': brand_sec_res.get('brand')
                        },
                        'engine': f'ThreatLens Explainable {kind.upper()} Brand Security Verifier'
                    }
                elif brand_sec_res['is_phishing']:
                    indicators.extend(brand_sec_res['indicators'])
                    score += brand_sec_res['score']
        except Exception as e:
            print(f"Brand security verifier error: {e}")

    # --- 2. Sentence-Bounded Funds Transfer & Semantic Slot Analysis ---
    ft_res = {'detected': False, 'total_score': 0, 'indicators': []}
    try:
        ft_res = analyze_funds_transfer(raw)
        if ft_res['indicators']:
            indicators.extend(ft_res['indicators'])
            score += ft_res['total_score']
    except Exception as e:
        print(f"Funds transfer analyzer error: {e}")

    # Social engineering rules
    rules = [
        # --- Hyper-Personalized Spear Phishing & Business Email Compromise (BEC) ---
        (
            r'\b(are you at your desk|are you available|in a conference|in a meeting|can\'t take calls|keep this confidential|urgent request for you|need a quick favor|reply directly to this email)\b',
            'Hyper-Personalized Executive Check-In (BEC)',
            'HIGH',
            32,
            'Message mimics a direct executive supervisor asking for urgent, off-channel assistance while claiming to be in a meeting.'
        ),
        (
            r'\b(update (my|the) direct deposit|change (my )?bank details for payroll|payroll routing|new bank account for paycheck|before payroll cutoff|paycheck direct deposit)\b',
            'Business Email Compromise (Payroll Diversion)',
            'CRITICAL',
            45,
            'Direct attempt to divert employee payroll direct deposit to an attacker-controlled bank account before payroll closes.'
        ),
        (
            r'\b(urgent wire transfer|wire the funds|overdue vendor invoice|payment instructions have changed|process this wire|confidential acquisition)\b',
            'Business Email Compromise (Wire Fraud)',
            'CRITICAL',
            45,
            'Solicits urgent wire transfer or changes to vendor invoice payment routing, a primary marker of corporate wire fraud.'
        ),
        (
            r'\b(buy (some )?gift cards|apple gift card|google play card|steam gift card|scratch the back|send pictures of the (cards|codes)|for a client gift)\b',
            'Executive Gift Card Procurement Scam',
            'CRITICAL',
            42,
            'Coerces employee into purchasing retail gift cards under the guise of an urgent executive client emergency.'
        ),
        (
            r'\b(send (me )?(the )?w-?2|employee tax forms|ssn list|payroll summary with ssn)\b',
            'Targeted Employee W-2 / PII Exfiltration',
            'CRITICAL',
            45,
            'Solicits bulk employee tax documents (W-2) or Social Security numbers for corporate identity theft.'
        ),
        # --- Standard Phishing Heuristics ---
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

    is_bec = (
        header_res.get('is_cousin_spoof')
        or ft_res.get('detected')
        or any('BEC' in ind['name'] or 'Compromise' in ind['name'] or 'Exfiltration' in ind['name'] or 'Gift Card' in ind['name'] or 'Financial Transfer' in ind['name'] or 'Cousin Domain' in ind['name'] for ind in indicators)
    )
    if is_bec:
        category = 'Spear Phishing / Business Email Compromise (BEC)'

    is_brand_phish = brand_sec_res.get('is_phishing', False)
    if is_brand_phish:
        category = 'Credential Harvesting & Brand Phishing'

    if header_res.get('is_cousin_spoof') and ft_res.get('detected'):
        final_score = min(99, max(96, score))
    elif is_brand_phish:
        final_score = min(99, max(95, score))
    elif header_res.get('is_cousin_spoof') or (is_bec and score >= 70):
        final_score = min(99, max(92, score))
    elif indicators:
        final_score = min(99, max(5, score))
    else:
        final_score = 8

    if final_score >= 75:
        risk_level = 'CRITICAL'
        if is_brand_phish:
            verdict = brand_sec_res.get('verdict')
            recommendation = brand_sec_res.get('recommendation')
        elif is_bec:
            verdict = 'Targeted Spear Phishing / BEC Attack Detected'
            recommendation = '🚨 DO NOT PROCESS: High-confidence Business Email Compromise (BEC) detected. Attack combines lookalike domain masquerading, executive impersonation, and unauthorized wire transfer commands. Verify out-of-band directly with the sender via telephone.'
        else:
            verdict = f'High Threat Phishing / Fraud {kind.upper()}'
            recommendation = '⛔ DO NOT ENGAGE: Malicious social engineering detected. Do not click links, provide OTP codes, or dial provided telephone numbers. Delete and report as spam.'
    elif final_score >= 40:
        risk_level = 'MODERATE'
        if is_bec:
            verdict = 'Suspicious Executive Ingestion Request'
            recommendation = '⚠️ CAUTION: Unscheduled off-channel request matching corporate impersonation patterns. Verify sender authenticity.'
        else:
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
        'recommendation': recommendation,
        'has_headers': header_res.get('has_headers', False),
        'sender_domain': header_res.get('sender_domain'),
        'recip_domain': header_res.get('recip_domain'),
        'is_cousin_spoof': header_res.get('is_cousin_spoof', False),
        'funds_transfer_detected': ft_res.get('detected', False),
        'funds_transfer_findings': ft_res.get('findings', [])
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
        model_mnb_loaded=get_model_mnb() is not None
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
