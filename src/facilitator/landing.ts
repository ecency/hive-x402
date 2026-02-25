export const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hive x402 Facilitator</title>
<meta name="description" content="x402 payment facilitator for Hive blockchain — zero-fee HBD micropayments for AI agents and APIs">
<style>
  :root {
    --bg: #0a0a0a;
    --surface: #141414;
    --border: #262626;
    --text: #e5e5e5;
    --muted: #8a8a8a;
    --accent: #e31337;
    --accent2: #ff3356;
    --code-bg: #1a1a1a;
    --green: #22c55e;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }

  /* Header */
  header {
    border-bottom: 1px solid var(--border);
    padding: 20px 0;
  }
  header .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .logo {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    letter-spacing: -0.5px;
  }
  .logo span { color: var(--accent); }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--green);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  nav a {
    color: var(--muted);
    text-decoration: none;
    font-size: 14px;
    margin-left: 24px;
  }
  nav a:hover { color: var(--text); }

  /* Hero */
  .hero {
    padding: 80px 0 60px;
    text-align: center;
  }
  .hero h1 {
    font-size: 40px;
    font-weight: 700;
    letter-spacing: -1px;
    margin-bottom: 16px;
  }
  .hero h1 span { color: var(--accent); }
  .hero p {
    font-size: 18px;
    color: var(--muted);
    max-width: 560px;
    margin: 0 auto 32px;
  }
  .badges {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .badge strong { color: var(--text); }

  /* Section */
  section {
    padding: 48px 0;
    border-top: 1px solid var(--border);
  }
  section h2 {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 20px;
    letter-spacing: -0.5px;
  }
  section p {
    color: var(--muted);
    margin-bottom: 16px;
    font-size: 15px;
  }

  /* Flow diagram */
  .flow {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin: 24px 0;
  }
  .flow-step {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 12px 0;
  }
  .flow-step + .flow-step { border-top: 1px solid var(--border); }
  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-content h3 { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .step-content p { font-size: 13px; color: var(--muted); margin: 0; }

  /* Endpoints */
  .endpoints {
    display: grid;
    gap: 12px;
    margin: 20px 0;
  }
  .endpoint {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .method {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    min-width: 50px;
    text-align: center;
  }
  .method.get { background: #0f2d1e; color: var(--green); }
  .method.post { background: #2d1a0f; color: #f59e0b; }
  .ep-path {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 14px;
    color: var(--text);
  }
  .ep-desc {
    color: var(--muted);
    font-size: 13px;
    margin-left: auto;
  }

  /* Code blocks */
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    overflow-x: auto;
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 13px;
    line-height: 1.7;
    margin: 16px 0;
  }
  .kw { color: #c678dd; }
  .str { color: #98c379; }
  .fn { color: #61afef; }
  .cm { color: #5c6370; font-style: italic; }
  .num { color: #d19a66; }
  .op { color: #56b6c2; }

  /* Tab bar */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0;
  }
  .tab {
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
    font-family: inherit;
  }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); }
  .tab:hover { color: var(--text); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Cards */
  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 20px 0;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }
  .card .num { font-size: 28px; font-weight: 700; color: var(--accent); }
  .card .label { font-size: 13px; color: var(--muted); margin-top: 4px; }

  /* Footer */
  footer {
    border-top: 1px solid var(--border);
    padding: 32px 0;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  footer a { color: var(--muted); text-decoration: none; }
  footer a:hover { color: var(--text); }

  /* Links */
  .btn {
    display: inline-block;
    padding: 10px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    margin: 4px;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-secondary { border: 1px solid var(--border); color: var(--text); }
  .btn-secondary:hover { border-color: var(--muted); }

  @media (max-width: 640px) {
    .hero h1 { font-size: 28px; }
    .cards { grid-template-columns: 1fr; }
    .ep-desc { display: none; }
    header .container { flex-wrap: wrap; gap: 8px; }
  }
</style>
</head>
<body>

<header>
  <div class="container">
    <a href="/" class="logo">hive <span>x402</span></a>
    <div style="display:flex;align-items:center;">
      <div class="status"><div class="status-dot"></div> Operational</div>
      <nav>
        <a href="#how-it-works">How it works</a>
        <a href="#api">API</a>
        <a href="#integrate">Integrate</a>
        <a href="https://github.com/ecency/hive-x402">GitHub</a>
      </nav>
    </div>
  </div>
</header>

<div class="container">

<div class="hero">
  <h1><span>x402</span> Payment Facilitator</h1>
  <p>Zero-fee micropayments for AI agents and APIs using HBD on the Hive blockchain.</p>
  <div class="badges">
    <span class="badge">Network: <strong>hive:mainnet</strong></span>
    <span class="badge">Asset: <strong>HBD</strong></span>
    <span class="badge">Fees: <strong>$0</strong></span>
    <span class="badge">Finality: <strong>3s</strong></span>
  </div>
</div>

<section id="how-it-works">
  <h2>How it works</h2>
  <p>This facilitator verifies and settles HBD payments following the <a href="https://www.x402.org" style="color:var(--accent);text-decoration:none;">x402 standard</a>. API servers use it to gate endpoints behind micropayments.</p>

  <div class="flow">
    <div class="flow-step">
      <div class="step-num">1</div>
      <div class="step-content">
        <h3>Client requests a paywalled endpoint</h3>
        <p>The API server returns HTTP 402 with payment requirements in the x-payment header.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="step-num">2</div>
      <div class="step-content">
        <h3>Client signs an HBD transfer</h3>
        <p>The client constructs and signs a Hive transaction (without broadcasting) and retries with the x-payment header.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="step-num">3</div>
      <div class="step-content">
        <h3>Facilitator verifies the signature</h3>
        <p>Recovers the public key from the secp256k1 signature and checks it against the sender's on-chain active key.</p>
      </div>
    </div>
    <div class="flow-step">
      <div class="step-num">4</div>
      <div class="step-content">
        <h3>Facilitator broadcasts and settles</h3>
        <p>The signed transaction is broadcast to the Hive network. The HBD arrives in the recipient's account with zero fees.</p>
      </div>
    </div>
  </div>
</section>

<section id="why-hive">
  <h2>Why Hive + HBD</h2>
  <div class="cards">
    <div class="card">
      <div class="num">$0</div>
      <div class="label">Transaction fees</div>
    </div>
    <div class="card">
      <div class="num">3s</div>
      <div class="label">Block finality</div>
    </div>
    <div class="card">
      <div class="num">$1</div>
      <div class="label">HBD peg (USD)</div>
    </div>
  </div>
  <p>Every micropayment arrives in full. No gas costs eating into small payments. HBD is Hive's algorithmic stablecoin pegged to the US dollar.</p>
</section>

<section id="api">
  <h2>API Endpoints</h2>
  <p>This facilitator exposes the following endpoints:</p>

  <div class="endpoints">
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="ep-path">/health</span>
      <span class="ep-desc">Health check</span>
    </div>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="ep-path">/supported-networks</span>
      <span class="ep-desc">Returns supported networks</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="ep-path">/verify</span>
      <span class="ep-desc">Verify a signed payment</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="ep-path">/settle</span>
      <span class="ep-desc">Verify + broadcast + mark nonce spent</span>
    </div>
  </div>
</section>

<section id="integrate">
  <h2>Integrate</h2>
  <p>Install the package:</p>
  <pre>npm install @hiveio/x402</pre>

  <div class="tabs">
    <button class="tab active" onclick="switchTab(event, 'tab-middleware')">API Server (Express)</button>
    <button class="tab" onclick="switchTab(event, 'tab-nextjs')">API Server (Next.js)</button>
    <button class="tab" onclick="switchTab(event, 'tab-client')">AI Agent Client</button>
  </div>

  <div id="tab-middleware" class="tab-panel active">
    <pre><span class="kw">import</span> express <span class="kw">from</span> <span class="str">"express"</span>;
<span class="kw">import</span> { paywall } <span class="kw">from</span> <span class="str">"@hiveio/x402/middleware"</span>;

<span class="kw">const</span> app = <span class="fn">express</span>();

app.<span class="fn">get</span>(<span class="str">"/api/premium"</span>, <span class="fn">paywall</span>({
  amount: <span class="str">"0.050 HBD"</span>,
  receivingAccount: <span class="str">"your-hive-account"</span>,
  facilitatorUrl: <span class="str">"https://x402.ecency.com"</span>,
}), (req, res) <span class="op">=&gt;</span> {
  res.<span class="fn">json</span>({ data: <span class="str">"premium content"</span> });
});</pre>
  </div>

  <div id="tab-nextjs" class="tab-panel">
    <pre><span class="cm">// app/api/premium/route.ts</span>
<span class="kw">import</span> { withPaywall } <span class="kw">from</span> <span class="str">"@hiveio/x402/middleware/nextjs"</span>;

<span class="kw">async function</span> <span class="fn">handler</span>(req, ctx) {
  <span class="kw">return</span> Response.<span class="fn">json</span>({
    data: <span class="str">"premium content"</span>,
    payer: ctx.payer
  });
}

<span class="kw">export const</span> GET = <span class="fn">withPaywall</span>({
  amount: <span class="str">"0.050 HBD"</span>,
  receivingAccount: <span class="str">"your-hive-account"</span>,
  facilitatorUrl: <span class="str">"https://x402.ecency.com"</span>,
}, handler);</pre>
  </div>

  <div id="tab-client" class="tab-panel">
    <pre><span class="kw">import</span> { HiveX402Client } <span class="kw">from</span> <span class="str">"@hiveio/x402/client"</span>;

<span class="kw">const</span> client = <span class="kw">new</span> <span class="fn">HiveX402Client</span>({
  account: <span class="str">"alice"</span>,
  activeKey: <span class="str">"5K..."</span>,   <span class="cm">// Hive active key (WIF)</span>
  maxPayment: <span class="num">0.1</span>,       <span class="cm">// max HBD per request</span>
});

<span class="cm">// Transparently handles 402 → sign → retry</span>
<span class="kw">const</span> res = <span class="kw">await</span> client.<span class="fn">fetch</span>(
  <span class="str">"https://api.example.com/premium"</span>
);
<span class="kw">const</span> data = <span class="kw">await</span> res.<span class="fn">json</span>();</pre>
  </div>
</section>

</div>

<footer>
  <div class="container">
    <p style="margin-bottom:12px;">
      <a class="btn btn-primary" href="https://github.com/ecency/hive-x402">GitHub</a>
      <a class="btn btn-secondary" href="https://www.npmjs.com/package/@hiveio/x402">npm</a>
      <a class="btn btn-secondary" href="https://www.x402.org">x402.org</a>
    </p>
    <p>Hive x402 Facilitator &middot; Powered by <a href="https://ecency.com">Ecency</a></p>
  </div>
</footer>

<script>
function switchTab(e, id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById(id).classList.add('active');
}
</script>
</body>
</html>`;
