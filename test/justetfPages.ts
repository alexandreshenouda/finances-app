/** Pages JustETF synthétiques pour les tests : même structure que les vrais profils
 *  ETF / action (attributs `data-testid`, blocs `data-overview`), contenu inventé. */

export const ETF_ISIN = 'IE00B4L5Y983';
export const STOCK_ISIN = 'US0378331005';

export const row = (kind: 'countries' | 'sectors', name: string, pct: string) => `
  <tr data-testid="etf-holdings_${kind}_row">
    <td data-testid="tl_etf-holdings_${kind}_value_name">${name}</td>
    <td><div class="right ws">
      <span data-testid="tl_etf-holdings_${kind}_value_percentage">${pct}%</span>
      <div class="progress-pill"><div class="progress-pill__bar" style="width:${pct}%;"></div></div>
    </div></td>
  </tr>`;

export const topRow = (isin: string, name: string, pct: string) => `
  <tr data-testid="etf-holdings_top-holdings_row">
    <td><a data-testid="tl_etf-holdings_top-holdings_link_name" href="/en/stock-profiles/${isin}" title="${name}"><span>${name}</span></a></td>
    <td><div class="right ws"><span data-testid="tl_etf-holdings_top-holdings_value_percentage">${pct}%</span></div></td>
  </tr>`;

/** Profil ETF complet (titre, TER, domicile, pays, secteurs, top positions). */
export function etfPage(opts: { countries?: string; sectors?: string; top?: string; title?: string; ter?: string; domicile?: string } = {}) {
  return `<html><body>
    ${opts.title ?? '<h1 id="etf-title" class="mb-1" data-testid="etf-profile-header_etf-name">iShares Core MSCI World &amp; Co</h1>'}
    ${opts.ter ?? '<div class="val bold" data-testid="etf-profile-header_ter-value">0.20% p.a.</div>'}
    <table data-testid="etf-holdings_top-holdings_table"><tbody>${opts.top ?? topRow('US67066G1040', 'NVIDIA Corp.', '5.53') + topRow(STOCK_ISIN, 'Apple', '5.07')}</tbody></table>
    <table data-testid="etf-holdings_countries_table"><tbody>${
      opts.countries ??
      row('countries', 'United States', '70.32') + row('countries', 'Japan', '5.79') + row('countries', 'Atlantis', '10.00') + row('countries', 'Other', '13.89')
    }</tbody></table>
    <table data-testid="etf-holdings_sectors_table"><tbody>${
      opts.sectors ?? row('sectors', 'Technology', '35.71') + row('sectors', 'Finance', '18,01') + row('sectors', 'Financials', '1.99')
    }</tbody></table>
    <table><tbody><tr data-testid="etf-basics_row_domicile-country">
      <td class="vallabel">Fund domicile</td>
      <td class="val" data-testid="tl_etf-basics_value_domicile-country">${opts.domicile ?? 'Ireland'}</td>
    </tr></tbody></table>
  </body></html>`;
}

export const overviewBlock = (label: string, value: string) => `
  <div class="d-flex d-flex-column">
    <div class="vallabel"> ${label} <div class="data-overview__info"><span data-toggle="tooltip" title="aide"></span></div></div>
    <div class="val bold">${value}</div>
  </div>`;

/** Profil action : bloc `data-overview` (structure réelle), puis libellés du profil. */
export function stockPage(opts: { blocks?: string; labels?: string; title?: string } = {}) {
  return `<html><body>
    ${opts.title ?? '<h1 id="stock-title" class="mb-1">Apple</h1>'}
    <div class="data-overview mt-4 mb-3">${
      opts.blocks ??
      overviewBlock('Market cap <span class="text-nowrap">(in EUR)</span>', '3,882,357 m') +
        overviewBlock('Country', 'United States') +
        overviewBlock('Sector', 'Technology') +
        overviewBlock('Dividend yield', '0.34%')
    }</div>
    <div class="pfofile-labels">${opts.labels ?? ''}</div>
  </body></html>`;
}
