# 📘 Comprehensive Project Documentation & Architecture Guide
## AI-Powered Cybersecurity Threat Intelligence & Phishing Website Detection System (ThreatLens)

---

## 📌 1. Project Overview & Executive Summary

### What is this project?
The **AI-Powered Cybersecurity Threat Intelligence System** (also branded as **ThreatLens**) is an enterprise-grade cybersecurity web platform designed to analyze, score, and detect **phishing websites**, **brand impersonation**, **typosquatting**, and **social engineering attacks (in Email and SMS)** in real time.

### Why was it built?
Traditional phishing detectors often rely on simple blacklists (which fail against brand-new zero-day attacks) or simplistic binary machine learning models (which often give false alarms on genuine domains like `paypal.com` or return vague, unhelpful results). 

This platform uses a **hybrid dual-engine approach**:
1. **Pre-Trained Machine Learning Inference:** Evaluates statistical token patterns and n-gram lexical characteristics learned from 549,000+ real-world URLs.
2. **Deterministic Heuristic Threat Rules & Brand Whitelisting:** Audits live URL structure, raw IP hosts, top-level domain abuse, punycode lookalikes, URL shorteners, and brand impersonation.
3. **Natural Language Social Engineering Classifier:** Scans emails and SMS for coercive urgency, credential solicitation, courier smishing, and fake authority.

---

## 🧠 2. How the Dataset & Machine Learning Models Work

### The Dataset: `Dataset/phishing_site_urls.csv`
- **Volume:** Over **549,346 labeled URLs**.
- **Columns:**
  - `URL`: The raw website address (e.g., `https://www.google.com`, `paypal-update.tk/login.php`, `192.168.1.1/admin`).
  - `Label`: Ground-truth classification:
    - `good`: Legitimate, verified, safe websites.
    - `bad`: Confirmed phishing, fraud, malware, or credential harvesting sites.

### How the Model Was Trained:
1. **Tokenization via `vectorizer.pkl` (CountVectorizer):**
   - URLs cannot be fed directly into math models as plain strings.
   - The `CountVectorizer` splits URLs into lexical sub-tokens, separators (`/`, `-`, `.`, `?`, `=`), and character n-grams.
   - It converts each URL string into a sparse numeric matrix representing token frequencies.
2. **Model 1: `phishing.pkl` (Logistic Regression):**
   - Calculates the probability of a URL belonging to the `bad` (phishing) class vs the `good` class using a sigmoid decision function.
3. **Model 2: `phishing_mnb.pkl` (Multinomial Naive Bayes):**
   - Applies Bayes' Theorem with strong independence assumptions across token frequencies for fast, complementary probability estimation.

### ⚠️ How the Model's False-Positive Bug Was Solved:
- **The Problem:** In raw training data, words like *"paypal"* or *"google"* appear thousands of times in malicious URLs (`paypal-login.com`, `paypal-verify.xyz`). Because of this, the naive ML model memorized the token *"paypal"* as 99% malicious, meaning that the official, genuine `paypal.com` was mistakenly scored as 99% phishing!
- **The Solution:** The backend now integrates an **Authoritative Brand Apex Directory** (`BRAND_DIRECTORY`). Genuine apex domains (e.g. `paypal.com`, `google.com`, `apple.com`, `github.com`) are verified and whitelisted. However, if an unauthorized domain contains the word *"paypal"* (e.g. `paypal-security.tk`), the system flags it as **Targeted Brand Impersonation (Critical Threat)**.

---

## 🗄️ 3. How the Database Works (`threatlens.db`)

The platform uses an embedded **SQLite 3** relational database located at `threatlens.db`.

### Table Schema: `analysis`
| Column Name | Data Type | Purpose |
| :--- | :--- | :--- |
| `id` | `TEXT PRIMARY KEY` | Unique UUID v4 for the scan |
| `kind` | `TEXT` | Target type: `'url'`, `'email'`, or `'sms'` |
| `value` | `TEXT` | The exact URL or message text inspected |
| `verdict` | `TEXT` | Human-readable decision (e.g., "Critical Phishing Threat Detected") |
| `score` | `INTEGER` | Calibrated risk score from `0` to `100` |
| `risk_level` | `TEXT` | Threat tier: `'LOW'`, `'MODERATE'`, `'HIGH'`, or `'CRITICAL'` |
| `threat_category` | `TEXT` | e.g., "Brand Impersonation Phishing", "Raw IP Credential Harvesting", "Destination Masking" |
| `confidence` | `INTEGER` | Model & heuristic confidence percentage (e.g. `98%`) |
| `risks` | `TEXT (JSON)` | Serialized list of triggered indicators with severity, points, and descriptions |
| `metadata` | `TEXT (JSON)` | Technical attributes: host, TLD, subdomain depth, protocol, brand status, recommendations |
| `user_email` | `TEXT` | Account email scoping the scan (e.g. `user@gmail.com` or `guest@threatlens.intel`) |
| `created` | `TEXT` | ISO 8601 UTC timestamp of the scan |

### 🔒 Per-User Data Isolation:
- Every scan sent from the frontend attaches the active logged-in user's email (`user_email`).
- When a user opens their **Threat Feed (Dashboard)**, the backend executes:
  ```sql
  SELECT * FROM analysis WHERE user_email = ? ORDER BY created DESC
  ```
- This guarantees that **each user's audit history and metrics remain private and isolated** from other users!

---

## 📂 4. File-by-File Code & Component Breakdown

```text
Phishing-Website-Detection-System/
├── app.py                         # Backend Server & Intelligence Core
├── requirements.txt               # Backend Python Dependencies
├── threatlens.db                  # SQLite Database Storage
├── vectorizer.pkl                 # TF-IDF CountVectorizer Artifact
├── phishing.pkl                   # Logistic Regression Classifier
├── phishing_mnb.pkl               # Multinomial Naive Bayes Classifier
├── sampleData.txt                 # Test Benchmark Samples & CLI Run Commands
├── README.md                      # GitHub Repository Documentation
├── PROJECT_DOCUMENTATION.md       # This comprehensive explanation document
│
├── Dataset/
│   └── phishing_site_urls.csv     # 549,000+ Labeled URL Dataset
│
├── templates/
│   └── index.html                 # Fallback web template
│
└── frontend/                      # Modern React 19 + Vite Application
    ├── package.json               # Frontend dependencies & build scripts
    ├── index.html                 # Web HTML entry (Google fonts & meta tags)
    ├── firebase.js                # Firebase Auth & Google OAuth 2.0 configuration
    ├── src.jsx                    # Complete React Single-Page Application
    ├── style.css                  # Cyber glassmorphic styling system & animations
    └── dist/                      # Compiled production assets served by Flask
```

### Detailed File Roles:

#### 1. [`app.py`](file:///c:/Users/rajde/OneDrive/Desktop/AI-POWERED%20CYBERSECURITY%20THREAT%20INTELLIGENCE%20SYSTEM/Phishing-Website-Detection-System/app.py) (The Backend Core)
- **Framework:** Flask 3.1 with CORS enabled.
- **Key Functions:**
  - `init_db()`: Initializes the SQLite database and executes automatic schema migrations for `user_email`, `metadata`, etc.
  - `evaluate_url(raw_url)`:
    - Parses hostname, protocol, path, query, and TLD using `urllib.parse`.
    - Normalizes leetspeak substitutions to catch typosquatting.
    - Checks against the authoritative `BRAND_DIRECTORY` for brand whitelisting vs brand spoofing.
    - Detects bare IP hosts, URL shorteners, disposable TLDs (.xyz, .tk, .top), excessive subdomains, non-standard web ports, and executable downloads (.exe, .apk).
    - Blends ML probabilities from `vectorizer.pkl` and `phishing.pkl`.
    - Returns calibrated risk score (0-100), risk level tier, explainable indicators, and SOC recommendation.
  - `evaluate_message(text, kind)`:
    - Analyzes Email and SMS text for social engineering lures (urgency pressure, OTP theft, courier fee smishing, financial bait, fake authority).
  - `save_analysis(...)`: Inserts scan result into `threatlens.db` bound to the active `user_email`.
  - **Endpoints:**
    - `POST /api/analyze/<kind>`: Scans URL, Email, or SMS and logs the record.
    - `GET /api/dashboard?user=<email>`: Fetches user-scoped stats and recent audits.
    - `GET /api/scan/<id>` & `DELETE /api/scan/<id>`: Fetches or deletes specific records.
    - `GET /api/health`: Health monitoring endpoint.
    - `GET /` & `GET /<path>`: Automatically serves the compiled React app from `frontend/dist/`.

#### 2. [`frontend/src.jsx`](file:///c:/Users/rajde/OneDrive/Desktop/AI-POWERED%20CYBERSECURITY%20THREAT%20INTELLIGENCE%20SYSTEM/Phishing-Website-Detection-System/frontend/src.jsx) (The Frontend UI)
Contains all React components structured in clean modular sections:
- `StarSprinkleCursor`: HTML5 canvas overlay emitting subtle 4-pointed diamond glitter stars behind the mouse pointer with zero idle CPU overhead.
- `ScoreGauge`: Animated SVG circular gauge meter rendering scores from 0% to 100% with dynamic emerald, amber, and crimson color transitions.
- `CyberNavbar`: Navigation header displaying brand logo **ThreatLens / DEFENSIVE INTELLIGENCE**, nav links, and authenticated user dropdown.
- `HomePage`: Hero section with real-time quick scanner, 5 one-click test presets, KPI metrics strip, differentiated tiers matrix, architecture cards, and FAQ accordion.
- `UrlScannerView`: Deep URL scanner showing verdict banner, score gauge, infrastructure chips (host, TLD, protocol, subdomains, IP host, shortener, brand status), and explainable indicators list.
- `MessagesScannerView`: Email and SMS smishing detector highlighting social engineering tactics.
- `DashboardView`: User-isolated threat telemetry with 3 coordinated charts:
  1. *Threat Severity Spectrum* (Doughnut chart with center badge)
  2. *Attack Vector Ingestion* (Bar chart)
  3. *Heuristic Threat Profile* (Cyber Radar chart)
  4. Searchable & filterable incident audit table.
- `LoginPage`: Full-page authentication view with Email/Password inputs, "Continue with Google" (Firebase), account creation toggle, and 1-Click Guest Analyst demo mode.
- `KnowledgeHubView`: Educational SOC reference guide on typosquatting and phishing prevention.

#### 3. [`frontend/firebase.js`](file:///c:/Users/rajde/OneDrive/Desktop/AI-POWERED%20CYBERSECURITY%20THREAT%20INTELLIGENCE%20SYSTEM/Phishing-Website-Detection-System/frontend/firebase.js)
- Initializes Firebase Web SDK with project configuration (`cybersecurity-96390`).
- Configures `GoogleAuthProvider` with `email` and `profile` scopes.
- Exports authentication helpers (`signInWithPopup`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut`, `onAuthStateChanged`).

#### 4. [`frontend/style.css`](file:///c:/Users/rajde/OneDrive/Desktop/AI-POWERED%20CYBERSECURITY%20THREAT%20INTELLIGENCE%20SYSTEM/Phishing-Website-Detection-System/frontend/style.css)
- Complete design system with CSS custom properties (`--cyan: #00f2fe`, `--safe-green: #10b981`, `--danger-red: #ef4444`).
- Cyber dark aesthetic, frosted glass cards (`backdrop-filter: blur(20px)`), glowing borders, responsive grid layouts, and page entrance animations (`@keyframes pageEnter`).

---

## 🎯 5. How Differentiated Threat Logic Works (Simple Pointwise)

One of the most important upgrades in this project is the **mathematically differentiated threat calculation**:

### 🟢 1. Low Risk (0% – 34%) · Verified Legitimate
- **Criteria:**
  - Official apex domain matches verified brand directory (e.g., `paypal.com`, `google.com`, `github.com`).
  - Standard HTTPS encryption.
  - Clean lexical structure without deceptive redirects or excessive hyphens.
- **Action:** Safe to browse. Standard safe browsing practices apply.

### 🟡 2. Moderate Risk (35% – 64%) · Cautionary Suspicion
- **Criteria:**
  - URL Shortener concealing destination (`bit.ly`, `tinyurl.com`, `t.co`).
  - High-risk or disposable TLD (`.xyz`, `.top`, `.click`, `.buzz`) on unknown domain.
  - Subdomain stacking (2–3 subdomain levels).
  - High hyphenation density in hostname (e.g. `my-portal-news-update.com`).
- **Action:** Caution advised. Verify sender provenance and inspect destination headers before proceeding.

### 🔴 3. High & Critical Risk (65% – 100%) · Active Phishing & Fraud
- **Criteria:**
  - **Brand Impersonation / Typosquatting:** Unauthorized host using trademarked names (`paypal-security-update.tk`, `appleid.apple.com.fake.xyz`).
  - **Bare IP Host:** Serving login credentials directly on an IP address (`http://192.168.1.100/login`).
  - **Malicious Payload Delivery:** Direct download of executable/script files (`.exe`, `.apk`, `.scr`, `.bat`).
  - **Punycode Spoofing:** `xn--...` Cyrillic lookalikes mimicking trusted institutions.
  - High ML classification probability (85%+).
- **Action:** Immediate block at firewall/DNS level. Do not enter credentials or download content.

---

## ⚡ 6. End-to-End Execution Flow (How It Runs in Practice)

1. **User opens website:**
   - Navigates to `http://localhost:5173` (development) or `http://127.0.0.1:8000` (production).
2. **Authentication:**
   - User signs in via Google OAuth 2.0, enters email/password, or clicks **"Continue as Guest Analyst"**.
   - User identity (`user_email`) is stored in React state.
3. **Scan Execution:**
   - User pastes a URL (e.g. `http://paypal-security-update.tk/login.php`) into the Hero scanner or URL Scanner tab.
   - React sends `POST /api/analyze/url` with `{ value, user_email }`.
4. **Backend Processing (`app.py`):**
   - URL is normalized.
   - Brand directory checks if domain is authorized or a spoof.
   - Vectorizer extracts n-gram tokens; Logistic Regression predicts phishing probability.
   - Heuristics check IP host, TLD, shorteners, redirects, and credential keywords.
   - Calibrated score is computed: **99% (CRITICAL)**.
   - Record is stored in SQLite `threatlens.db` tagged with `user_email`.
5. **Frontend Rendering:**
   - The animated Radial Gauge displays **99%** in crimson glow.
   - Verdict Banner shows **"Critical Phishing Threat Detected"**.
   - Infrastructure breakdown chips show hostname, TLD (`.tk`), and brand impersonation flag.
   - Explainable Indicators accordion details exact reasons and score impacts.
6. **Dashboard Telemetry:**
   - When the user opens the **Threat Feed**, Chart.js renders real-time Doughnut, Bar, and Radar charts scoped strictly to that user's scan history.

---

## 🛠️ 7. Terminal Commands Quick Reference

### Run Backend Server:
```powershell
& "C:\Users\rajde\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" app.py
```
*(Runs Flask API & serves frontend at `http://127.0.0.1:8000`)*

### Run Frontend Dev Server (Hot-Reloading):
```powershell
cd frontend
npm.cmd run dev
```
*(Runs Vite at `http://localhost:5173`)*

### Build Frontend for Production:
```powershell
cd frontend
npm.cmd run build
```
*(Compiles React assets into `frontend/dist/`)*

---
*Created for academic evaluation, portfolio presentation, and future system reference.*
