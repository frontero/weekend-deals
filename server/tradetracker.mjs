// TradeTracker's own figures for the admin's Klikken page: which clicks became a booking and what they pay. Read from
// its affiliate web service (SOAP) with the account's customer ID and passphrase (TRADETRACKER_CUSTOMER_ID and
// TRADETRACKER_PASSPHRASE, scripts/setup-tradetracker.sh). Node only: the rounds run it.

const ENDPOINT = 'https://ws.tradetracker.com/soap/affiliate';
const DAY_MS = 24 * 60 * 60 * 1000;
// A booking is assessed weeks after the stay, so the list looks back far.
const KEPT_DAYS = 180;
const REPORT_DAYS = 30;
const MOST = 500;
// The account may hold other sites; only this one's figures belong here.
const SITE_HOST = 'parkjeweg.nl';

const escapeXml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const unescapeXml = (value) =>
  value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, name) =>
    name[0] === '#' ? String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()],
  );

/**
 * The answer's XML as nested objects: an element with children becomes an object, a repeated name (the `item`s of a
 * list) an array, and text a string. Attributes and namespace prefixes are dropped.
 */
export function parseXml(xml) {
  const root = { children: {} };
  const open = [root];
  for (const [, closing, name, selfClosing, text] of xml.matchAll(/<(\/)?([\w:.-]+)[^>]*?(\/)?>|([^<]+)/g)) {
    const current = open.at(-1);
    if (text !== undefined) {
      if (text.trim()) current.text = (current.text ?? '') + unescapeXml(text);
    } else if (closing) {
      open.pop();
    } else if (name[0] !== '?') {
      const node = { children: {} };
      const key = name.replace(/^.*:/, '');
      (current.children[key] ??= []).push(node);
      if (!selfClosing) open.push(node);
    }
  }
  const valueOf = (node) => {
    const names = Object.keys(node.children);
    if (!names.length) return node.text ?? null;
    return Object.fromEntries(names.map((name) => [name, name === 'item' ? node.children[name].map(valueOf) : valueOf(node.children[name].at(-1))]));
  };
  return valueOf(root);
}

/** One call of the web service; `session` is the cookie `signIn` returned. */
async function call(operation, parameters, { session = '', fetcher = fetch } = {}) {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${ENDPOINT}/${operation}"`, ...(session && { Cookie: session }) },
    body: `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${ENDPOINT}"><soapenv:Body><ns1:${operation}>${parameters}</ns1:${operation}></soapenv:Body></soapenv:Envelope>`,
  });
  const body = parseXml(await response.text())?.Envelope?.Body ?? {};
  if (!response.ok || body.Fault) throw new Error(`TradeTracker ${operation}: ${String(body.Fault?.faultstring ?? response.status).slice(0, 200)}`);
  return { response, answer: body[`${operation}Response`] ?? {} };
}

/** Signs in and returns the session cookie the other calls need. */
export async function signIn({ customerId, passphrase }, { fetcher = fetch } = {}) {
  const { response } = await call(
    'authenticate',
    `<customerID>${escapeXml(customerId)}</customerID><passphrase>${escapeXml(passphrase)}</passphrase><sandbox>false</sandbox><locale>nl_NL</locale><demo>false</demo>`,
    { fetcher },
  );
  const session = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  if (!session) throw new Error('TradeTracker authenticate: no session');
  return session;
}

const items = (list) => (Array.isArray(list?.item) ? list.item : []);
const amount = (value) => (value == null ? null : Number(value));

/** The account's sites: the ones the reports are per. */
export const ownSites = (sites) => sites.filter((site) => site.url.includes(SITE_HOST));

export async function affiliateSites(session, { fetcher = fetch } = {}) {
  const { answer } = await call('getAffiliateSites', '<options><excludeInfo>true</excludeInfo></options>', { session, fetcher });
  return items(answer.affiliateSites).map((site) => ({ id: site.ID, name: site.name, url: site.URL ?? '' }));
}

/**
 * A site's leads and sales registered since `from`, newest first. Without the visitor's IP address: the admin has no
 * use for it.
 */
export async function conversions(session, siteId, from, { fetcher = fetch } = {}) {
  const { answer } = await call(
    'getConversionTransactions',
    `<affiliateSiteID>${escapeXml(siteId)}</affiliateSiteID><options><registrationDateFrom>${escapeXml(from)}</registrationDateFrom><limit>${MOST}</limit><sort>registrationDate</sort><sortDirection>descending</sortDirection></options>`,
    { session, fetcher },
  );
  return items(answer.conversionTransactions).map((entry) => ({
    id: entry.ID,
    campaign: entry.campaign?.name ?? '',
    product: entry.campaignProduct?.name ?? '',
    reference: entry.reference ?? '',
    type: entry.transactionType,
    status: entry.transactionStatus,
    commission: amount(entry.commission) ?? 0,
    orderAmount: amount(entry.orderAmount),
    currency: entry.currency ?? 'EUR',
    registeredAt: entry.registrationDate,
    assessedAt: entry.assessmentDate ?? null,
    clickedAt: entry.originatingClickDate ?? null,
    rejection: entry.rejectionReason ?? null,
    paidOut: entry.paidOut === 'true',
  }));
}

/** Per campaign what TradeTracker itself counted between two days: its clicks, leads, sales and commission. */
export async function campaignReport(session, siteId, from, to, { fetcher = fetch } = {}) {
  const { answer } = await call('getReportCampaign', `<affiliateSiteID>${escapeXml(siteId)}</affiliateSiteID><options><dateFrom>${from}</dateFrom><dateTo>${to}</dateTo></options>`, { session, fetcher });
  return items(answer.reportCampaign)
    .map(({ campaign, reportData: data }) => ({
      campaign: campaign?.name ?? '',
      clicks: amount(data?.uniqueClickCount) ?? 0,
      leads: amount(data?.leadCount) ?? 0,
      sales: amount(data?.saleCount) ?? 0,
      commission: amount(data?.totalCommission) ?? 0,
    }))
    .filter((row) => row.clicks || row.leads || row.sales || row.commission);
}

/** The key from the account, or null when the rounds have none. */
export function tradeTrackerAccount(env = process.env) {
  const customerId = env.TRADETRACKER_CUSTOMER_ID?.trim();
  const passphrase = env.TRADETRACKER_PASSPHRASE?.trim();
  return customerId && passphrase ? { customerId, passphrase } : null;
}

/** Reads every site's bookings and report and stores them for the admin. Returns how many bookings it read. */
export async function updateAffiliateSales(db, account, { fetcher = fetch, now = Date.now() } = {}) {
  const day = (time) => new Date(time).toISOString().slice(0, 10);
  const session = await signIn(account, { fetcher });
  const transactions = [];
  const report = [];
  for (const site of ownSites(await affiliateSites(session, { fetcher }))) {
    transactions.push(...(await conversions(session, site.id, new Date(now - KEPT_DAYS * DAY_MS).toISOString().slice(0, 19), { fetcher })));
    report.push(...(await campaignReport(session, site.id, day(now - REPORT_DAYS * DAY_MS), day(now), { fetcher })));
  }
  await db.saveAffiliateSales({ checkedAt: new Date(now).toISOString(), reportDays: REPORT_DAYS, transactions, report });
  return transactions.length;
}

const dashed = (text) => text.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Each booking with the park and the place on the site its click came from. The link carries them as one note,
 * "<park code>-<place>" with only letters, digits and dashes left (affiliateUrl), so the park is found by its code
 * written the same way.
 */
export function withClickOrigin(transactions, parks) {
  const byNote = new Map(parks.map((park) => [dashed(park.code), park]));
  return transactions.map((entry) => {
    const cut = entry.reference.lastIndexOf('-');
    const park = byNote.get(entry.reference.slice(0, Math.max(cut, 0))) ?? byNote.get(entry.reference);
    return { ...entry, parkCode: park?.code ?? null, parkName: park?.name ?? null, source: park && cut > 0 && byNote.get(entry.reference) !== park ? entry.reference.slice(cut + 1) : null };
  });
}
