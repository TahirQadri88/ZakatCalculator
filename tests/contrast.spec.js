// Colour contrast guard (WCAG AA): every visible text element, placeholder
// and input outline on the main screens, in light and dark, in both languages.
// Text needs 4.5:1 (3:1 when large); input outlines need 3:1 against their
// surroundings. Gradients are approximated by their first colour stop.
const { test, expect } = require('./fixtures');

const AUDIT=()=>{
  const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p.length>3?p[3]:1]};
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const blend=(top,bot)=>{const a=top[3];return [0,1,2].map(i=>top[i]*a+bot[i]*(1-a)).concat(1)};
  const bgOf=el=>{const layers=[];let gradient=false;
    for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);
      if(cs.backgroundImage&&cs.backgroundImage!=='none'){ // use first gradient stop as approximation
        const m=cs.backgroundImage.match(/rgba?\([^)]+\)/); if(m){layers.push(parse(m[0]));gradient=true;break;}}
      const c=parse(cs.backgroundColor); if(c&&c[3]>0){layers.push(c); if(c[3]>=1)break;}}
    let col=[255,255,255,1]; for(let i=layers.length-1;i>=0;i--) col=blend(layers[i],col); return col;};
  const out=[];
  for(const el of document.querySelectorAll('body *')){
    if(!el.offsetParent&&getComputedStyle(el).position!=='fixed')continue;
    const own=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    const isField=/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if(!own&&!isField)continue;
    const r=el.getBoundingClientRect(); if(r.width<2||r.height<2)continue;
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||+cs.opacity===0)continue;
    let fg=parse(cs.color); const bg=bgOf(el); fg=blend(fg,bg);
    const L1=lum(fg),L2=lum(bg); const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const size=parseFloat(cs.fontSize), bold=+cs.fontWeight>=700; const need=(size>=24||(bold&&size>=18.66))?3:4.5;
    if(cr<need) out.push(`${cr.toFixed(2)} <${need} ${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}.${(el.getAttribute('class')||'').split(' ')[0]} "${(el.value||el.textContent).trim().slice(0,30)}"`);
  }
  // placeholders (text) and input borders (non-text, need 3:1)
  for(const el of document.querySelectorAll('input[placeholder],select,input')){
    if(!el.offsetParent)continue; const bg=bgOf(el);
    if(el.placeholder&&!el.value){const ps=getComputedStyle(el,'::placeholder');const fg=blend(parse(ps.color),bg);
      const cr=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05); if(cr<4.5) out.push(`${cr.toFixed(2)} <4.5 PLACEHOLDER #${el.id}`);}
    const cs=getComputedStyle(el); const outer=bgOf(el.parentElement); const bc=blend(parse(cs.borderTopColor),outer);
    const cr=(Math.max(lum(bc),lum(outer))+.05)/(Math.min(lum(bc),lum(outer))+.05); if(cr<3) out.push(`${cr.toFixed(2)} <3 INPUT-BORDER ${el.tagName.toLowerCase()}#${el.id} on ${outer.map(Math.round)}`);
  }
  return out;};

for (const theme of ['light', 'dark']) {
  for (const lang of ['en', 'ur']) {
    test(`contrast: ${theme} ${lang} home, steps and result`, async ({ page }) => {
      test.setTimeout(45000);
      await page.addInitScript(t => { try { localStorage.setItem('z_theme', t); } catch (e) {} }, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      if (lang === 'ur') await page.locator('#btnUr').click();
      await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
      const fails = [];
      const check = async name => (await page.evaluate(AUDIT)).forEach(f => fails.push(`${name}: ${f}`));
      await check('home');
      await page.locator('.calc-hero-card').click();
      await page.locator('#s_rate').fill('3000');
      await page.locator('#s_rate').dispatchEvent('input');
      await check('step1');
      await page.locator('#step-1 .btn-primary').click();
      await page.locator('#v_gold').fill('5000000');
      await check('step2');
      await page.locator("#step-2 .btn-primary").click();
      await check('step3');
      await page.locator('#step-3 .btn-primary').click();
      await check('step4');
      await page.locator('#step-4 .btn-primary').click();
      await check('result');
      // Overlays: save a record first so the records list is checked too.
      await page.locator('.result-actions .btn-primary').first().click();
      await page.evaluate(() => openFAQ());
      await check('faq');
      await page.evaluate(() => closeFAQ());
      await page.evaluate(() => openHistory());
      await check('records');
      await page.evaluate(() => closeHistory());
      await page.evaluate(() => openHistRates());
      await check('gold-rates');
      expect([...new Set(fails)]).toEqual([]);
    });
  }
}


// Controls must be findable, not just readable: in dark mode every button and
// tappable control needs its fill or its outline at 3:1 against what is around
// it (WCAG 1.4.11). Text-only links (.top-back-btn, .link-btn, footer links)
// are exempt - their text is the affordance and is covered by the text check.
const CONTROLS = () => {
  const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const blend = (t, b) => [0, 1, 2].map(i => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const bgOf = el => { const L = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) { const m = cs.backgroundImage.match(/rgba?\([^)]+\)/g); if (m) { L.push(parse(m[m.length > 1 ? 1 : 0])); break; } } const c = parse(cs.backgroundColor); if (c && c[3] > 0) { L.push(c); if (c[3] >= 1) break; } } let col = [255, 255, 255, 1]; for (let i = L.length - 1; i >= 0; i--) col = blend(L[i], col); return col; };
  const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const out = [];
  for (const el of document.querySelectorAll('button, .btn, [role="button"], .lbtn, select')) {
    if (!el.offsetParent || el.getBoundingClientRect().width < 8) continue;
    if (el.matches('.top-back-btn, .link-btn, .lbtn')) continue;
    const cs = getComputedStyle(el), outer = bgOf(el.parentElement), fill = bgOf(el);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const edge = Math.max(cr(fill, outer), bw > 0 ? cr(blend(parse(cs.borderTopColor), outer), outer) : 0);
    if (edge < 3) out.push(`${edge.toFixed(2)} ${(el.getAttribute('class') || el.tagName).split(' ')[0]}: ${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}`);
  }
  return out;
};

for (const lang of ['en', 'ur']) {
  test(`dark mode: buttons and controls stand out (${lang})`, async ({ page }) => {
    test.setTimeout(45000);
    await page.addInitScript(() => { try { localStorage.setItem('z_theme', 'dark'); } catch (e) {} });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    if (lang === 'ur') await page.locator('#btnUr').click();
    await page.addStyleTag({ content: '*{transition:none!important}' });
    const found = new Set();
    const check = async () => (await page.evaluate(CONTROLS)).forEach(x => found.add(x));
    await check();
    await page.locator('.calc-hero-card').click();
    await page.locator('#s_rate').fill('3000');
    await page.locator('#s_rate').dispatchEvent('input');
    await check();
    for (const s of [1, 2, 3, 4]) { await page.locator(`#step-${s} .btn-primary`).click(); await check(); }
    await page.locator('.result-actions .btn-primary').first().click();
    await page.evaluate(() => openHistory()); await check(); await page.evaluate(() => closeHistory());
    await page.evaluate(() => openHistRates()); await check(); await page.evaluate(() => closeHistRates());
    await page.evaluate(() => openFAQ()); await check();
    expect([...found].sort()).toEqual([]);
  });
}
