// Payment method glyphs (Lucide wallet and credit-card, ISC licence), inline so nothing loads from the network.
// Plain methods get the wallet; cards (repay / statement) get the credit card. No ids are hard-coded.
const PAY_ICON_ATTRS = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="pay-ic"';
const PAY_ICON_WALLET = `<svg ${PAY_ICON_ATTRS}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`;
const PAY_ICON_CARD = `<svg ${PAY_ICON_ATTRS}><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>`;
function payIconSvg(method){
  const t = method && method.cardType;
  return (t === 'repay' || t === 'statement') ? PAY_ICON_CARD : PAY_ICON_WALLET;
}
