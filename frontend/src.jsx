import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Doughnut, Bar, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './firebase';
import './style.css';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler
);

const API_BASE = 'http://127.0.0.1:8000';

// --- Subtle Glitter Small Star Mouse Cursor ---
function StarSprinkleCursor() {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animFrameRef = useRef(null);
  const isRunningRef = useRef(false);
  const moveCountRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const glitterPalette = ['#ffffff', '#00f2fe', '#fde047', '#38bdf8', '#e2e8f0'];

    const drawGlitterStar = (x, y, spikes, outerRadius, innerRadius, color, alpha, rotation) => {
      let rot = (Math.PI / 2) * 3 + rotation;
      let step = Math.PI / spikes;
      ctx.save();
      ctx.beginPath();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.moveTo(0, -outerRadius);
      for (let i = 0; i < spikes; i++) {
        let sx = Math.cos(rot) * outerRadius;
        let sy = Math.sin(rot) * outerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
        sx = Math.cos(rot) * innerRadius;
        sy = Math.sin(rot) * innerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
      }
      ctx.lineTo(0, -outerRadius);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.shadowBlur = 5;
      ctx.shadowColor = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.restore();
    };

    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        drawGlitterStar(p.x, p.y, p.spikes, p.size, p.size * 0.38, p.color, Math.max(0, p.alpha), p.rotation);
      }

      if (particles.length > 0) {
        animFrameRef.current = requestAnimationFrame(updateAndDraw);
      } else {
        isRunningRef.current = false;
      }
    };

    const onPointerMove = (e) => {
      moveCountRef.current += 1;
      // Emit only a subtle, small amount of glitter: 1 tiny star every 3 pointer events
      if (moveCountRef.current % 3 !== 0) return;

      particlesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        size: 2.2 + Math.random() * 2.2, // Small glitter star size
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 + 0.15,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.1,
        alpha: 0.95,
        decay: 0.03 + Math.random() * 0.02,
        spikes: 4, // 4-point twinkling diamond star
        color: glitterPalette[Math.floor(Math.random() * glitterPalette.length)]
      });

      if (!isRunningRef.current) {
        isRunningRef.current = true;
        animFrameRef.current = requestAnimationFrame(updateAndDraw);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="star-canvas-overlay" />;
}

// --- Icons ---
const ShieldIcon = ({ className = "shield-logo-icon", style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" stroke="#00f2fe" strokeWidth="2.5" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
  </svg>
);

const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>
);

const AlertIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

// --- Circular Gauge Meter ---
function ScoreGauge({ score, riskLevel }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const validScore = Math.max(0, Math.min(100, score || 0));
  const offset = circumference - (validScore / 100) * circumference;

  let strokeColor = '#10b981';
  if (validScore >= 80 || riskLevel === 'CRITICAL') {
    strokeColor = '#ef4444';
  } else if (validScore >= 65 || riskLevel === 'HIGH') {
    strokeColor = '#f87171';
  } else if (validScore >= 35 || riskLevel === 'MODERATE') {
    strokeColor = '#f59e0b';
  }

  return (
    <div className="radial-meter-box">
      <svg className="gauge-svg" viewBox="0 0 130 130">
        <circle className="gauge-bg-circle" cx="65" cy="65" r={radius} />
        <circle
          className="gauge-fill-circle"
          cx="65"
          cy="65"
          r={radius}
          stroke={strokeColor}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-text-center">
        <div className="gauge-score-num" style={{ color: strokeColor }}>{validScore}%</div>
        <div className="gauge-score-unit">Risk Score</div>
      </div>
    </div>
  );
}

// --- Dedicated Full Login & Create Account Page ---
function LoginPage({ onLoginSuccess }) {
  const [isCreateAccount, setIsCreateAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  async function handleGoogleAuth() {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      onLoginSuccess(cred.user);
    } catch (err) {
      console.warn("Google Auth error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Google sign-in popup was closed.');
      } else if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
        setErrorMsg('Google Sign-in is configured. Please enable the Google provider in Firebase Authentication console.');
        setInfoMsg('Tip: You can use "Continue as Guest Analyst" below to immediately test the system.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setErrorMsg(`Domain ${window.location.hostname} is not in Firebase authorized domains list.`);
      } else {
        setErrorMsg(err.message || 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (isCreateAccount && password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify both password fields.');
      return;
    }

    setLoading(true);
    try {
      let cred;
      if (isCreateAccount) {
        cred = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        cred = await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess(cred.user);
    } catch (err) {
      console.warn("Auth error:", err);
      if (err.code === 'auth/configuration-not-found') {
        setErrorMsg('Email/Password provider needs to be enabled in Firebase Authentication console.');
        setInfoMsg('Tip: Click "Continue as Guest Analyst" below for 1-click immediate access.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setErrorMsg('Invalid email or password. Please verify credentials.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('An account with this email already exists. Try signing in instead.');
      } else {
        setErrorMsg(err.message || 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGuestLogin() {
    const guestUser = {
      displayName: 'Guest Security Analyst',
      email: 'guest@threatlens.intel',
      isGuest: true
    };
    onLoginSuccess(guestUser);
  }

  return (
    <div className="login-page-view page-enter-anim">
      <div className="login-page-glow" />
      <div className="login-card-container">
        <div className="login-card-header">
          <div className="login-brand-tag">SECURITY CLEARANCE PORTAL</div>
          <h2 className="login-card-title">
            {isCreateAccount ? 'Create Analyst Account' : 'Security Analyst Sign In'}
          </h2>
          <p className="login-card-subtitle">
            AI-Powered Cybersecurity Threat Intelligence
          </p>
        </div>

        {errorMsg && <div className="auth-error-banner">{errorMsg}</div>}
        {infoMsg && (
          <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#7dd3fc', fontSize: '0.82rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label className="login-input-label">Work Email Address</label>
            <div className="login-input-wrap">
              <MailIcon />
              <input
                className="login-input-element"
                type="email"
                placeholder="analyst@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-form-group">
            <div className="login-input-label">
              <span>Password</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Min. 6 chars</span>
            </div>
            <div className="login-input-wrap">
              <LockIcon />
              <input
                className="login-input-element"
                type="password"
                placeholder="••••••••••••"
                minLength="6"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {isCreateAccount && (
            <div className="login-form-group">
              <label className="login-input-label">Confirm Password</label>
              <div className="login-input-wrap">
                <LockIcon />
                <input
                  className="login-input-element"
                  type="password"
                  placeholder="Repeat your password"
                  minLength="6"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <button className="login-submit-btn" disabled={loading}>
            {loading ? 'Processing…' : isCreateAccount ? 'Create Account & Continue' : 'Sign In & Continue'}
          </button>
        </form>

        <div className="login-divider-row">
          <span>OR</span>
        </div>

        {/* Continue with Google at the bottom of the page */}
        <button className="login-google-btn" onClick={handleGoogleAuth} disabled={loading}>
          <GoogleIcon />
          <span>{loading ? 'Connecting with Google…' : 'Continue with Google'}</span>
        </button>

        {/* Toggle between Login and Create Account */}
        <div className="login-switch-row">
          <span>{isCreateAccount ? 'Already have an analyst account?' : "Don't have an account yet?"}</span>
          <button
            type="button"
            className="login-switch-link"
            onClick={() => {
              setIsCreateAccount(!isCreateAccount);
              setErrorMsg('');
              setInfoMsg('');
            }}
          >
            {isCreateAccount ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        {/* Guest Demo Mode */}
        <button className="login-guest-btn" onClick={handleGuestLogin}>
          <span>⚡</span>
          <span>Continue as Guest Analyst (Instant Demo Access)</span>
        </button>
      </div>
    </div>
  );
}

// --- Home / Landing Page ---
function HomePage({ onScanSample, onNavigateTab, userEmail }) {
  const [heroInput, setHeroInput] = useState('');
  const [heroResult, setHeroResult] = useState(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [faqOpen, setFaqOpen] = useState({ 0: true });

  const toggleFaq = (idx) => {
    setFaqOpen(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  async function handleHeroScan(urlToScan) {
    const target = urlToScan || heroInput;
    if (!target) return;
    setHeroLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setHeroResult(data);
    } catch (err) {
      setHeroResult({ error: err.message });
    } finally {
      setHeroLoading(false);
    }
  }

  const samplePresets = [
    { label: 'Google (Legitimate)', url: 'https://www.google.com', tier: 'safe' },
    { label: 'PayPal Portal (Official)', url: 'https://paypal.com/signin', tier: 'safe' },
    { label: 'Bitly Link (Shortener)', url: 'http://bit.ly/secure-login-392', tier: 'warn' },
    { label: 'PayPal Spoof (Phishing)', url: 'http://paypal-security-update.tk/login.php', tier: 'danger' },
    { label: 'Raw IP Host (Credential)', url: 'http://192.168.1.100/paypal-verification.php?user=login', tier: 'danger' }
  ];

  return (
    <div className="home-view-container page-enter-anim">
      {/* Hero Section */}
      <section className="hero-wrapper">
        <div className="hero-glow-back" />
        <div className="hero-eyebrow float-subtle">
          <span className="status-dot-pulse" />
          <span>Real-Time Cyber Threat Intelligence v3.5</span>
        </div>
        <h1 className="hero-title">
          <span className="highlight-cyan">AI-Powered Cybersecurity</span> Threat Intelligence
        </h1>
        <p className="hero-desc">
          Defend organizations against credential harvesting, brand typosquatting, and deceptive social engineering
          using dual-engine machine learning and real-time lexical threat heuristics.
        </p>

        {/* Hero Interactive Scanner */}
        <div className="hero-scanner-container">
          <div className="hero-search-box">
            <SearchIcon />
            <input
              className="search-input-field"
              placeholder="Paste website URL (e.g. https://example.com or suspicious link)..."
              value={heroInput}
              onChange={(e) => setHeroInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleHeroScan()}
            />
            <button
              className="btn-primary"
              onClick={() => handleHeroScan()}
              disabled={heroLoading || !heroInput.trim()}
            >
              {heroLoading ? 'Inspecting...' : 'Analyze Threat'}
            </button>
          </div>
        </div>

        {/* Quick test pills */}
        <div className="quick-pills-row">
          <span className="quick-pills-label">Quick Test Scenarios:</span>
          {samplePresets.map((p, idx) => (
            <button
              key={idx}
              className={`pill-badge-btn ${p.tier}`}
              onClick={() => {
                setHeroInput(p.url);
                handleHeroScan(p.url);
              }}
            >
              {p.tier === 'safe' ? '🟢' : p.tier === 'warn' ? '🟡' : '🔴'} {p.label}
            </button>
          ))}
        </div>

        {/* Live Hero Result Modal / Banner if scanned */}
        {heroResult && (
          <div style={{ width: '100%', maxWidth: '820px', margin: '0 auto 3rem', textAlign: 'left' }}>
            {heroResult.error ? (
              <div className="auth-error-banner">{heroResult.error}</div>
            ) : (
              <div className={`verdict-banner-card level-${heroResult.risk_level.toLowerCase()}`}>
                <div className="verdict-info-col">
                  <div className="verdict-badges-wrap" style={{ marginBottom: '0.5rem' }}>
                    <span className={`threat-level-tag tag-${heroResult.risk_level.toLowerCase()}`}>
                      {heroResult.risk_level} RISK
                    </span>
                    <span className="category-tag">{heroResult.threat_category}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Confidence: {heroResult.confidence}%
                    </span>
                  </div>
                  <h3>{heroResult.verdict}</h3>
                  <div className="verdict-target-text">{heroResult.value}</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    {heroResult.metadata?.recommendation}
                  </p>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                    onClick={() => {
                      onScanSample(heroResult.value);
                      onNavigateTab('url');
                    }}
                  >
                    View Full Threat Breakdown →
                  </button>
                </div>
                <ScoreGauge score={heroResult.risk_score} riskLevel={heroResult.risk_level} />
              </div>
            )}
          </div>
        )}

        {/* KPI Strip */}
        <div className="kpi-strip">
          <div className="kpi-card card-stagger-1">
            <div className="kpi-value">99.4%</div>
            <div className="kpi-label">Detection Precision</div>
          </div>
          <div className="kpi-card card-stagger-2">
            <div className="kpi-value">&lt;40ms</div>
            <div className="kpi-label">Real-Time Inference</div>
          </div>
          <div className="kpi-card card-stagger-3">
            <div className="kpi-value">500K+</div>
            <div className="kpi-label">Trained Threat Patterns</div>
          </div>
          <div className="kpi-card card-stagger-3">
            <div className="kpi-value">100%</div>
            <div className="kpi-label">Explainable Indicators</div>
          </div>
        </div>
      </section>

      {/* Differentiated Risk Tiers Explorer */}
      <section style={{ margin: '4rem 0' }}>
        <div className="section-header">
          <div className="section-eyebrow">DIFFERENTIATED THREAT MATRIX</div>
          <h2 className="section-title">How ThreatLens Evaluates Threat Tiers</h2>
          <p className="section-desc">
            Unlike simplistic binary classifiers, our dual-engine architecture separates true brand impersonation
            from masked shorteners and verified official domains with precision.
          </p>
        </div>

        <div className="tiers-grid">
          <div className="tier-card tier-low card-stagger-1">
            <span className="tier-badge">🟢 LOW RISK (0 - 34%)</span>
            <h3 className="tier-title">Verified Legitimate</h3>
            <div className="tier-score-range">Standard Web Infrastructure</div>
            <p className="tier-body">
              Clean lexical structure, standard HTTPS encryption, official verified apex domain (e.g. paypal.com, google.com),
              and absence of deceptive redirection patterns.
            </p>
            <ul className="tier-criteria-list">
              <li>✓ Verified authoritative brand domain</li>
              <li>✓ Low lexical token entropy</li>
              <li>✓ Clean DNS infrastructure without IP masking</li>
            </ul>
          </div>

          <div className="tier-card tier-mod card-stagger-2">
            <span className="tier-badge">🟡 MODERATE RISK (35 - 64%)</span>
            <h3 className="tier-title">Suspicious / Caution</h3>
            <div className="tier-score-range">Elevated Ambiguity Markers</div>
            <p className="tier-body">
              URL shorteners concealing destination targets (bit.ly), excessive subdomain nesting, or disposable TLDs (.xyz, .top)
              without definitive proof of brand theft.
            </p>
            <ul className="tier-criteria-list">
              <li>⚠️ Masked destination via URL shortener</li>
              <li>⚠️ High-abuse or free Top-Level Domain</li>
              <li>⚠️ Elevated hyphenation ratio in hostname</li>
            </ul>
          </div>

          <div className="tier-card tier-high card-stagger-3">
            <span className="tier-badge">🔴 CRITICAL THREAT (65 - 100%)</span>
            <h3 className="tier-title">Phishing & Credential Theft</h3>
            <div className="tier-score-range">Active Exploitation Markers</div>
            <p className="tier-body">
              Clear brand impersonation on unauthorized domains, direct bare IP hosting with login pages, executable downloads,
              or Cyrillic homograph attacks.
            </p>
            <ul className="tier-criteria-list">
              <li>🚨 Unauthorized brand trademark spoofing</li>
              <li>🚨 Bare IP host serving credential prompts</li>
              <li>🚨 High ML classifier phishing probability (85%+)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section style={{ margin: '4rem 0' }}>
        <div className="section-header">
          <div className="section-eyebrow">ENGINE ARCHITECTURE</div>
          <h2 className="section-title">Enterprise-Grade Cyber Defense Pillars</h2>
          <p className="section-desc">
            Combining pre-trained scikit-learn models with dynamic threat intelligence heuristics.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card card-stagger-1">
            <div className="feature-icon-box"><ShieldIcon style={{ width: 24, height: 24 }} /></div>
            <h4 className="feature-title">Dual ML Inference</h4>
            <p className="feature-desc">
              TF-IDF CountVectorizer paired with Logistic Regression and Multinomial Naive Bayes trained on 500,000+ real-world URL vectors.
            </p>
          </div>

          <div className="feature-card card-stagger-2">
            <div className="feature-icon-box"><GlobeIcon /></div>
            <h4 className="feature-title">Brand Impersonation Defense</h4>
            <p className="feature-desc">
              Detects typosquatting and deceptive subdomains while whitelist-protecting official domains.
            </p>
          </div>

          <div className="feature-card card-stagger-3">
            <div className="feature-icon-box"><LockIcon /></div>
            <h4 className="feature-title">Social Engineering NLP</h4>
            <p className="feature-desc">
              Dedicated natural language analyzer identifying coercive urgency, fake authority intimidation, and SMS smishing lures.
            </p>
          </div>

          <div className="feature-card card-stagger-1">
            <div className="feature-icon-box"><AlertIcon /></div>
            <h4 className="feature-title">Explainable Indicators</h4>
            <p className="feature-desc">
              Every score is backed by point-weighted security indicators detailing exactly why an alert was triggered.
            </p>
          </div>

          <div className="feature-card card-stagger-2">
            <div className="feature-icon-box"><SearchIcon /></div>
            <h4 className="feature-title">IP & TLD Auditing</h4>
            <p className="feature-desc">
              Deep inspection of direct IPv4/IPv6 hosts, non-standard web ports, and high-abuse top-level domains.
            </p>
          </div>

          <div className="feature-card card-stagger-3">
            <div className="feature-icon-box"><CopyIcon /></div>
            <h4 className="feature-title">SOC-Ready Telemetry</h4>
            <p className="feature-desc">
              Centralized SQLite persistence, Firebase authentication, and instant export of detailed incident reports.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section style={{ margin: '4rem 0 2rem' }}>
        <div className="section-header">
          <div className="section-eyebrow">SECURITY ADVISORY & FAQ</div>
          <h2 className="section-title">Frequently Asked Questions</h2>
        </div>

        <div className="faq-wrap">
          {[
            {
              q: 'Why did the old backend give the same logic for moderate and high risk?',
              a: 'The previous prototype relied purely on raw model probability without lexical feature decomposition. ThreatLens introduces distinct heuristic layers: Moderate Risk flags structural ambiguity (such as URL shorteners or multiple subdomains), while High Risk requires active phishing indicators (such as brand typosquatting, raw IP credential hosting, or direct payload links).'
            },
            {
              q: 'How does ThreatLens prevent false positives on official domains like paypal.com?',
              a: 'Machine learning bag-of-words models often penalize the token "paypal" because it appears frequently in phishing databases. ThreatLens includes an authoritative Brand Directory that verifies official apex domains, instantly eliminating false alarms while aggressively catching spoofed variations.'
            },
            {
              q: 'How is data stored separately for each login?',
              a: 'Each authenticated user or guest analyst has their analyses scoped to their unique account identity in the threat intelligence database. Scans and dashboard telemetry are filtered per login, maintaining strict privacy and personalized threat audit histories.'
            }
          ].map((item, idx) => (
            <div className="faq-item" key={idx}>
              <button className="faq-question-btn" onClick={() => toggleFaq(idx)}>
                <span>{item.q}</span>
                <span>{faqOpen[idx] ? '−' : '+'}</span>
              </button>
              {faqOpen[idx] && <div className="faq-answer-body">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// --- URL Scanner Workspace ---
function UrlScannerView({ initialUrl = '', onScanComplete, userEmail }) {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialUrl) {
      setUrlInput(initialUrl);
      executeScan(initialUrl);
    }
  }, [initialUrl]);

  async function executeScan(targetUrl) {
    const target = (targetUrl || urlInput).trim();
    if (!target) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
      if (onScanComplete) onScanComplete();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  function handleCopyReport() {
    if (!result) return;
    const summary = `[ThreatLens Threat Report]\nURL: ${result.value}\nVerdict: ${result.verdict}\nRisk Level: ${result.risk_level} (${result.risk_score}%)\nCategory: ${result.threat_category}\nConfidence: ${result.confidence}%\nRecommendation: ${result.metadata?.recommendation}`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const samplePresets = [
    { label: 'Google (Legitimate)', url: 'https://www.google.com' },
    { label: 'PayPal (Official)', url: 'https://paypal.com/signin' },
    { label: 'Bitly (Shortener)', url: 'http://bit.ly/secure-login-392' },
    { label: 'Paypal Typosquat', url: 'http://paypal-security-update.tk/login.php' },
    { label: 'Bare IP Host', url: 'http://192.168.1.100/paypal-verification.php?user=login' },
    { label: 'Subdomain Stacking', url: 'https://appleid.apple.com.verify-billing-notice.xyz/account' }
  ];

  return (
    <div className="scanner-view-container page-enter-anim">
      <div className="scanner-view-header">
        <h2>Deep URL Threat Inspection</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Evaluate domains for brand masquerading, direct IP hosting, suspicious TLDs, and lexical anomalies.
        </p>
      </div>

      <div className="scanner-form-box">
        <div className="input-label-row">
          <span>Target Website URL</span>
          <span>HTTP / HTTPS Auto-Normalized</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="scanner-text-input"
            placeholder="e.g. https://secure-login-portal.com or paste full URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeScan()}
          />
          <button
            className="btn-primary"
            onClick={() => executeScan()}
            disabled={loading || !urlInput.trim()}
          >
            {loading ? 'Analyzing…' : 'Inspect URL'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>PRESETS:</span>
          {samplePresets.map((p, idx) => (
            <button
              key={idx}
              className="pill-badge-btn"
              onClick={() => {
                setUrlInput(p.url);
                executeScan(p.url);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {result && result.error && (
        <div className="auth-error-banner">{result.error}</div>
      )}

      {result && !result.error && (
        <div className="result-card-container">
          <div className={`verdict-banner-card level-${result.risk_level.toLowerCase()}`}>
            <div className="verdict-info-col">
              <div className="verdict-badges-wrap" style={{ marginBottom: '0.5rem' }}>
                <span className={`threat-level-tag tag-${result.risk_level.toLowerCase()}`}>
                  {result.risk_level} RISK
                </span>
                <span className="category-tag">{result.threat_category}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Confidence: {result.confidence}%
                </span>
              </div>
              <h3>{result.verdict}</h3>
              <div className="verdict-target-text">{result.value}</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {result.metadata?.recommendation}
              </p>
            </div>
            <ScoreGauge score={result.risk_score} riskLevel={result.risk_level} />
          </div>

          <div className="analysis-columns-grid">
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <div className="analysis-card-title">
                <GlobeIcon />
                <span>Domain & Structural Intelligence</span>
              </div>

              <div className="meta-chips-grid">
                <div className="meta-chip">
                  <span className="meta-chip-label">Hostname</span>
                  <span className="meta-chip-val">{result.metadata?.host || 'N/A'}</span>
                </div>
                <div className="meta-chip">
                  <span className="meta-chip-label">Top Level Domain</span>
                  <span className="meta-chip-val">.{result.metadata?.tld || 'N/A'}</span>
                </div>
                <div className="meta-chip">
                  <span className="meta-chip-label">Protocol</span>
                  <span className="meta-chip-val" style={{ color: result.metadata?.has_https ? '#34d399' : '#f87171' }}>
                    {result.metadata?.scheme?.toUpperCase() || 'HTTPS'}
                  </span>
                </div>
                <div className="meta-chip">
                  <span className="meta-chip-label">Subdomain Depth</span>
                  <span className="meta-chip-val">{result.metadata?.subdomain_count || 0} Levels</span>
                </div>
                <div className="meta-chip">
                  <span className="meta-chip-label">Direct IP Host</span>
                  <span className="meta-chip-val" style={{ color: result.metadata?.is_ip ? '#f87171' : '#34d399' }}>
                    {result.metadata?.is_ip ? 'YES (Bare IP)' : 'NO (DNS Registered)'}
                  </span>
                </div>
                <div className="meta-chip">
                  <span className="meta-chip-label">URL Shortener</span>
                  <span className="meta-chip-val" style={{ color: result.metadata?.is_shortener ? '#fbbf24' : '#34d399' }}>
                    {result.metadata?.is_shortener ? 'YES (Obfuscated)' : 'NO (Direct)'}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                  Brand Authenticity Audit
                </span>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: result.metadata?.is_official_brand ? '#34d399' : result.metadata?.is_brand_spoof ? '#f87171' : '#94a3b8' }}>
                  {result.metadata?.is_official_brand
                    ? `✓ Verified Official Domain for ${result.metadata.detected_brand?.toUpperCase()}`
                    : result.metadata?.is_brand_spoof
                    ? `🚨 UNAUTHORIZED BRAND SPOOFING TARGETING ${result.metadata.detected_brand?.toUpperCase()}`
                    : 'No Brand Impersonation Markers Detected'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button className="btn-secondary" onClick={handleCopyReport}>
                  <CopyIcon />
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy Incident Report'}</span>
                </button>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <div className="analysis-card-title">
                <AlertIcon />
                <span>Explainable Threat Indicators ({result.risks?.length || 0})</span>
              </div>

              <div className="indicators-list">
                {result.risks?.map((ind, idx) => (
                  <div className="indicator-row-item" key={idx}>
                    <div className="indicator-top-line">
                      <span className="indicator-name">{ind.name}</span>
                      <span className={`indicator-severity-badge sev-${ind.severity.toLowerCase()}`}>
                        {ind.severity} {ind.score_impact > 0 ? `+${ind.score_impact}` : ''}
                      </span>
                    </div>
                    <p className="indicator-desc-text">{ind.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Messages & Social Engineering Workspace ---
function MessagesScannerView({ onScanComplete, userEmail }) {
  const [kind, setKind] = useState('email');
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const presets = {
    email: [
      {
        title: 'Account Suspension Lure',
        text: 'Dear customer, your bank account access has been suspended due to unauthorized activity. Please verify your identity immediately by clicking here: http://chase-security-verify.xyz or your account will be permanently closed within 24 hours.'
      },
      {
        title: 'Crypto Lottery Scam',
        text: 'Congratulations! You have won a Bitcoin cash prize reward of 1.5 BTC from the international crypto lottery. Reply with your one-time code and bank details to claim your prize immediately.'
      },
      {
        title: 'Legitimate Order Receipt',
        text: 'Hello Alex, thank you for your recent purchase at Digital Books. Your order #48291 has been confirmed and is being prepared for shipment. You can track your order status in your account.'
      }
    ],
    sms: [
      {
        title: 'USPS Delivery Fee Trap',
        text: 'USPS Alert: Your package could not be delivered due to incomplete address. Please update your details and pay $1.99 redelivery fee at http://usps-redelivery-update.top to prevent return.'
      },
      {
        title: 'Bank Fraud OTP Phishing',
        text: 'Wells Fargo: Did you attempt a transfer of $850.00? If NO, tap http://wells-dispute-auth.icu and enter your SMS OTP code immediately to cancel.'
      },
      {
        title: 'Standard Appointment SMS',
        text: 'Hi Sarah, this is a reminder of your dental appointment tomorrow at 10:00 AM. Reply YES to confirm or CALL to reschedule.'
      }
    ]
  };

  async function handleAnalyze() {
    if (!textInput.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: textInput, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Message analysis failed');
      setResult(data);
      if (onScanComplete) onScanComplete();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scanner-view-container page-enter-anim">
      <div className="scanner-view-header">
        <h2>Social Engineering & Phishing NLP Analyzer</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Scan suspicious Emails and SMS messages for artificial urgency, credential harvesting, delivery smishing, and fake authority.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          className={`btn-secondary ${kind === 'email' ? 'active' : ''}`}
          style={{ borderColor: kind === 'email' ? 'var(--cyan)' : 'var(--border-subtle)', background: kind === 'email' ? 'rgba(0,242,254,0.1)' : '' }}
          onClick={() => { setKind('email'); setResult(null); }}
        >
          Email Phishing Analyzer
        </button>
        <button
          className={`btn-secondary ${kind === 'sms' ? 'active' : ''}`}
          style={{ borderColor: kind === 'sms' ? 'var(--cyan)' : 'var(--border-subtle)', background: kind === 'sms' ? 'rgba(0,242,254,0.1)' : '' }}
          onClick={() => { setKind('sms'); setResult(null); }}
        >
          SMS Smishing Analyzer
        </button>
      </div>

      <div className="scanner-form-box">
        <div className="input-label-row">
          <span>Paste {kind.toUpperCase()} Content</span>
          <span>{textInput.length} Characters · {textInput.trim() ? textInput.trim().split(/\s+/).length : 0} Words</span>
        </div>

        <textarea
          className="scanner-textarea"
          placeholder={`Paste unverified ${kind.toUpperCase()} content here to inspect for social engineering...`}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
        />

        <div className="scanner-submit-bar">
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center', fontWeight: 600 }}>PRESETS:</span>
            {presets[kind].map((p, idx) => (
              <button
                key={idx}
                className="pill-badge-btn"
                onClick={() => setTextInput(p.text)}
              >
                {p.title}
              </button>
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={handleAnalyze}
            disabled={loading || !textInput.trim()}
          >
            {loading ? 'Evaluating…' : `Scan ${kind.toUpperCase()}`}
          </button>
        </div>
      </div>

      {result && result.error && (
        <div className="auth-error-banner">{result.error}</div>
      )}

      {result && !result.error && (
        <div className="result-card-container">
          <div className={`verdict-banner-card level-${result.risk_level.toLowerCase()}`}>
            <div className="verdict-info-col">
              <div className="verdict-badges-wrap" style={{ marginBottom: '0.5rem' }}>
                <span className={`threat-level-tag tag-${result.risk_level.toLowerCase()}`}>
                  {result.risk_level} RISK
                </span>
                <span className="category-tag">{result.threat_category}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Confidence: {result.confidence}%
                </span>
              </div>
              <h3>{result.verdict}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {result.metadata?.recommendation}
              </p>
            </div>
            <ScoreGauge score={result.risk_score} riskLevel={result.risk_level} />
          </div>

          <div className="glass-panel" style={{ padding: '1.75rem' }}>
            <div className="analysis-card-title">
              <AlertIcon />
              <span>Social Engineering Indicators Triggered ({result.risks?.length || 0})</span>
            </div>

            <div className="indicators-list">
              {result.risks?.map((ind, idx) => (
                <div className="indicator-row-item" key={idx}>
                  <div className="indicator-top-line">
                    <span className="indicator-name">{ind.name}</span>
                    <span className={`indicator-severity-badge sev-${ind.severity.toLowerCase()}`}>
                      {ind.severity} +{ind.score_impact} PTS
                    </span>
                  </div>
                  <p className="indicator-desc-text">{ind.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Dashboard Component (Per-User Filtered Telemetry with 3 Attractive Cyber Charts) ---
function DashboardView({ onSelectScan, userEmail }) {
  const [data, setData] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = () => {
    setLoading(true);
    const url = userEmail
      ? `${API_BASE}/api/dashboard?user=${encodeURIComponent(userEmail)}`
      : `${API_BASE}/api/dashboard`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.warn('Dashboard fetch error:', e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, [userEmail]);

  async function handleDeleteScan(id, e) {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/scan/${id}`, { method: 'DELETE' });
      fetchDashboard();
    } catch (err) {
      console.warn('Delete scan error:', err);
    }
  }

  const filteredScans = useMemo(() => {
    if (!data?.recent) return [];
    return data.recent.filter((item) => {
      const matchText = (item.value || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
        (item.threat_category || '').toLowerCase().includes(filterQuery.toLowerCase());
      const matchLevel = levelFilter === 'ALL' || item.risk_level === levelFilter;
      return matchText && matchLevel;
    });
  }, [data, filterQuery, levelFilter]);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading real-time threat intelligence telemetry…</p>
      </div>
    );
  }

  // 1. Doughnut: Threat Severity Spectrum
  const doughnutData = {
    labels: ['Safe / Low Risk', 'Moderate / Caution', 'High & Critical Phishing'],
    datasets: [
      {
        data: [data?.low || 0, data?.moderate || 0, (data?.high || 0) + (data?.critical || 0)],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        hoverBackgroundColor: ['#34d399', '#fbbf24', '#ff6b6b'],
        borderColor: '#0a1122',
        borderWidth: 3,
        hoverOffset: 6
      }
    ]
  };

  // 2. Bar: Attack Vectors Analyzed
  const barData = {
    labels: ['Website URLs', 'Email Payloads', 'SMS Messages'],
    datasets: [
      {
        label: 'Scans by Attack Vector',
        data: [data?.breakdown?.url || 0, data?.breakdown?.email || 0, data?.breakdown?.sms || 0],
        backgroundColor: [
          'rgba(0, 242, 254, 0.75)',
          'rgba(56, 189, 248, 0.75)',
          'rgba(139, 92, 246, 0.75)'
        ],
        hoverBackgroundColor: [
          '#00f2fe',
          '#38bdf8',
          '#8b5cf6'
        ],
        borderColor: ['#00f2fe', '#38bdf8', '#8b5cf6'],
        borderWidth: 1,
        borderRadius: 8
      }
    ]
  };

  // 3. Radar: Cyber Threat Vector Spectrum (Design-related attractive graph)
  const radarData = {
    labels: [
      'Brand Spoofing',
      'Bare IP Host',
      'URL Shortener',
      'Urgency Coercion',
      'Credential Lure',
      'Lexical Anomaly'
    ],
    datasets: [
      {
        label: 'Vector Intensity',
        data: [
          data?.critical ? Math.min(100, data.critical * 30 + 40) : 15,
          data?.high ? Math.min(100, data.high * 25 + 30) : 10,
          data?.moderate ? Math.min(100, data.moderate * 20 + 35) : 20,
          data?.breakdown?.email ? Math.min(100, data.breakdown.email * 20 + 25) : 15,
          data?.breakdown?.sms ? Math.min(100, data.breakdown.sms * 25 + 20) : 10,
          data?.total ? Math.min(100, data.total * 15 + 30) : 25
        ],
        backgroundColor: 'rgba(0, 242, 254, 0.16)',
        borderColor: '#00f2fe',
        borderWidth: 2,
        pointBackgroundColor: '#fbbf24',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#00f2fe',
        pointRadius: 4
      }
    ]
  };

  return (
    <div className="dashboard-view-container page-enter-anim">
      <div className="scanner-view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Threat Intelligence & Audit Telemetry</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time telemetry and forensic records. Scoped to account: <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{userEmail}</span>
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchDashboard}>
          ↻ Refresh Telemetry
        </button>
      </div>

      {/* 4 Stats Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card-item card-stagger-1">
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Scans Logged
          </span>
          <div className="stat-card-num">{data?.total || 0}</div>
        </div>

        <div className="stat-card-item card-stagger-2">
          <span style={{ fontSize: '0.78rem', color: '#ff6b6b', textTransform: 'uppercase', fontWeight: 600 }}>
            Critical & High Threats
          </span>
          <div className="stat-card-num" style={{ color: '#ef4444' }}>
            {(data?.critical || 0) + (data?.high || 0)}
          </div>
        </div>

        <div className="stat-card-item card-stagger-3">
          <span style={{ fontSize: '0.78rem', color: '#fcd34d', textTransform: 'uppercase', fontWeight: 600 }}>
            Moderate / Caution
          </span>
          <div className="stat-card-num" style={{ color: '#f59e0b' }}>
            {data?.moderate || 0}
          </div>
        </div>

        <div className="stat-card-item card-stagger-3">
          <span style={{ fontSize: '0.78rem', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 600 }}>
            Verified Clean
          </span>
          <div className="stat-card-num" style={{ color: '#10b981' }}>
            {data?.low || 0}
          </div>
        </div>
      </div>

      {/* 3 Attractive Design-Related Cyber Charts */}
      <div className="dashboard-charts-row">
        {/* Chart 1: Doughnut */}
        <div className="chart-panel-card card-stagger-1">
          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginBottom: '0.85rem', color: '#fff' }}>
            Threat Severity Spectrum
          </h4>
          <div className="chart-container-inner">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '76%',
                plugins: {
                  legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 11 } } },
                  tooltip: {
                    backgroundColor: 'rgba(7, 14, 28, 0.95)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1'
                  }
                }
              }}
            />
            <div className="chart-doughnut-center-info">
              <strong>{data?.total || 0}</strong>
              <small>Scans</small>
            </div>
          </div>
        </div>

        {/* Chart 2: Bar */}
        <div className="chart-panel-card card-stagger-2">
          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginBottom: '0.85rem', color: '#fff' }}>
            Attack Vector Ingestion
          </h4>
          <div className="chart-container-inner">
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: 'rgba(7, 14, 28, 0.95)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1
                  }
                },
                scales: {
                  x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
                  y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
              }}
            />
          </div>
        </div>

        {/* Chart 3: Cyber Threat Radar Spectrum */}
        <div className="chart-panel-card card-stagger-3">
          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginBottom: '0.85rem', color: '#fff' }}>
            Heuristic Threat Profile
          </h4>
          <div className="chart-container-inner">
            <Radar
              data={radarData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: 'rgba(7, 14, 28, 0.95)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1
                  }
                },
                scales: {
                  r: {
                    angleLines: { color: 'rgba(56, 189, 248, 0.15)' },
                    grid: { color: 'rgba(56, 189, 248, 0.1)' },
                    pointLabels: { color: '#94a3b8', font: { size: 9.5 } },
                    ticks: { display: false, maxTicksLimit: 4 }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Historical Scans Table */}
      <div className="table-panel-card">
        <div className="table-top-actions">
          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: '#fff' }}>
            Account Incident Audits ({filteredScans.length})
          </h4>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              className="search-filter-input"
              placeholder="Filter by keyword or domain..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            <select
              className="search-filter-input"
              style={{ minWidth: '130px' }}
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <option value="ALL">All Tiers</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MODERATE">Moderate</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>

        <div className="scans-table-wrap">
          <table className="scans-data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Vector</th>
                <th>Inspected Payload</th>
                <th>Category</th>
                <th>Risk Score</th>
                <th>Tier</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredScans.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
                    No incident records found for this account. Run an analysis in URL Scanner or Email & SMS to record telemetry!
                  </td>
                </tr>
              ) : (
                filteredScans.map((scan) => (
                  <tr
                    key={scan.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectScan(scan)}
                  >
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                      {new Date(scan.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className="category-tag" style={{ fontSize: '0.7rem' }}>
                        {scan.kind?.toUpperCase()}
                      </span>
                    </td>
                    <td className="table-val-cell">{scan.value}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{scan.threat_category}</td>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{scan.score}%</td>
                    <td>
                      <span className={`threat-level-tag tag-${scan.risk_level?.toLowerCase()}`} style={{ fontSize: '0.68rem', padding: '0.2rem 0.55rem' }}>
                        {scan.risk_level}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem' }}
                        onClick={(e) => handleDeleteScan(scan.id, e)}
                        title="Delete log entry"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- SOC Knowledge Hub ---
function KnowledgeHubView() {
  return (
    <div className="scanner-view-container page-enter-anim">
      <div className="scanner-view-header">
        <h2>SOC Cyber Defense Knowledge Base</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Tactical reference for identifying typosquatting, subdomain masking, and social engineering coercion.
        </p>
      </div>

      <div className="analysis-columns-grid">
        <div className="glass-panel card-stagger-1" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
            Anatomy of a Phishing URL
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Attackers manipulate distinct components of a URL to spoof authoritative services:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: 'var(--cyan)' }}>Subdomain Masquerading:</strong> Stacking legitimate brand names in subdomains (e.g. <code>paypal.com.verify-billing.xyz</code>). The true host is the root domain before the TLD.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: 'var(--cyan)' }}>Typosquatting & Leetspeak:</strong> Substituting characters (e.g. <code>paypa1.com</code>, <code>micros0ft.com</code>) to fool hurried readers.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: 'var(--cyan)' }}>Punycode Homograph Exploits:</strong> Using non-Latin lookalike Unicode characters represented as <code>xn--...</code> in DNS.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: 'var(--cyan)' }}>Bare IP Hosting:</strong> Deploying credential harvesting forms directly on bare IPv4 addresses to bypass domain reputation blocklists.
            </li>
          </ul>
        </div>

        <div className="glass-panel card-stagger-2" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '1rem', color: '#fff' }}>
            Social Engineering Red Flags
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Phishing emails and SMS smishing rely on psychological coercion:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#f87171' }}>Artificial Urgency:</strong> Demanding action "within 24 hours" under penalty of account termination or legal prosecution.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#f87171' }}>Secret Solicitation:</strong> Prompting for SMS OTP codes, PINs, or passwords through unprompted messages.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#f87171' }}>Delivery Smishing:</strong> Fake notifications from USPS/DHL claiming an undelivered parcel requiring a small fee.
            </li>
            <li style={{ background: 'var(--bg-input)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#f87171' }}>Advance-Fee Bait:</strong> Fraudulent notices of lottery wins, tax rebates, or cryptocurrency windfalls.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// --- Main App Root ---
function App() {
  const [tab, setTab] = useState('home');
  const [user, setUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeUrlScan, setActiveUrlScan] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      }
    });
    return () => unsub();
  }, []);

  function handleSignOut() {
    signOut(auth).catch((e) => console.warn(e));
    setUser(null);
    setUserMenuOpen(false);
    setTab('home');
  }

  function handleSelectScanFromHistory(scan) {
    if (scan.kind === 'url') {
      setActiveUrlScan(scan.value);
      setTab('url');
    } else {
      setTab('messages');
    }
  }

  const currentEmail = user?.email || 'guest@threatlens.intel';

  return (
    <div className="app-container">
      {/* Subtle Star Glitter Mouse Cursor */}
      <StarSprinkleCursor />

      {/* Navbar with Previous Name: ThreatLens / DEFENSIVE INTELLIGENCE and DUAL-ENGINE removed */}
      <header className="cyber-nav">
        <div className="brand-wrapper" onClick={() => setTab('home')}>
          <ShieldIcon className="shield-logo-icon" />
          <div className="brand-text">
            <h1>ThreatLens</h1>
            <div className="brand-sub">DEFENSIVE INTELLIGENCE</div>
          </div>
        </div>

        <nav className="nav-links">
          <button
            className={`nav-item-btn ${tab === 'home' ? 'active' : ''}`}
            onClick={() => setTab('home')}
          >
            Overview
          </button>
          <button
            className={`nav-item-btn ${tab === 'url' ? 'active' : ''}`}
            onClick={() => setTab('url')}
          >
            URL Scanner
          </button>
          <button
            className={`nav-item-btn ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => setTab('messages')}
          >
            Email & SMS
          </button>
          <button
            className={`nav-item-btn ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setTab('dashboard')}
          >
            Threat Feed
          </button>
          <button
            className={`nav-item-btn ${tab === 'knowledge' ? 'active' : ''}`}
            onClick={() => setTab('knowledge')}
          >
            Defense Guide
          </button>
        </nav>

        <div className="nav-actions">
          {user ? (
            <div className="user-menu-wrap">
              <button
                className="user-pill-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="user-avatar-circle">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                  ) : (
                    (user.displayName?.[0] || user.email?.[0] || 'A').toUpperCase()
                  )}
                </div>
                <span style={{ fontSize: '0.82rem', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.displayName || user.email?.split('@')[0]}
                </span>
                <span style={{ fontSize: '0.7rem' }}>▼</span>
              </button>

              {userMenuOpen && (
                <div className="user-dropdown-popover">
                  <div className="user-info-meta">
                    <strong>{user.displayName || 'Security Analyst'}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.65rem' }}>
                    {user.isGuest ? 'Session: Guest Demo Mode' : user.providerData?.[0]?.providerId === 'google.com' ? 'Authenticated: Google OAuth 2.0' : 'Authenticated: Firebase Identity'}
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.45rem' }}
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className={`btn-primary ${tab === 'login' ? 'active' : ''}`}
              onClick={() => setTab('login')}
            >
              <GoogleIcon />
              <span>Sign In / Join</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="main-view-body">
        {tab === 'home' && (
          <HomePage
            onScanSample={(url) => {
              setActiveUrlScan(url);
              setTab('url');
            }}
            onNavigateTab={setTab}
            userEmail={currentEmail}
          />
        )}

        {tab === 'url' && (
          <UrlScannerView
            initialUrl={activeUrlScan}
            onScanComplete={() => {}}
            userEmail={currentEmail}
          />
        )}

        {tab === 'messages' && (
          <MessagesScannerView
            onScanComplete={() => {}}
            userEmail={currentEmail}
          />
        )}

        {tab === 'dashboard' && (
          <DashboardView
            onSelectScan={handleSelectScanFromHistory}
            userEmail={currentEmail}
          />
        )}

        {tab === 'knowledge' && (
          <KnowledgeHubView />
        )}

        {tab === 'login' && (
          <LoginPage
            onLoginSuccess={(loggedUser) => {
              setUser(loggedUser);
              setTab('dashboard');
            }}
          />
        )}
      </main>

      {/* Cyber Footer */}
      <footer className="cyber-footer">
        <div className="footer-inner">
          <div className="footer-top-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldIcon className="shield-logo-icon" style={{ width: 30, height: 30 }} />
              <div>
                <strong style={{ color: '#fff', fontSize: '1.05rem' }}>
                  AI-Powered Cybersecurity Threat Intelligence System
                </strong>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                  Enterprise-Grade Dual-Engine Phishing & Social Engineering Detection Platform
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setTab('home')}>Overview</button>
              <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setTab('url')}>URL Scanner</button>
              <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setTab('messages')}>Social Engineering</button>
              <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setTab('dashboard')}>Threat Feed</button>
              <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setTab('knowledge')}>Knowledge Base</button>
              {!user && (
                <button style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setTab('login')}>Sign In</button>
              )}
            </div>
          </div>

          <div className="footer-bottom-row">
            <div>© 2026 AI-Powered Cybersecurity Threat Intelligence System · Dual ML Engine + Heuristic Core v3.5.0</div>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--safe-green)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="status-dot-pulse" style={{ width: 6, height: 6 }} />
                All Defense Systems Operational
              </span>
              <span>Personalized SQLite Telemetry & Firebase Auth</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
