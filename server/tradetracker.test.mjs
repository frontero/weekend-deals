import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXml, tradeTrackerAccount, updateAffiliateSales, withClickOrigin } from './tradetracker.mjs';

const envelope = (operation, inner) =>
  `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="https://ws.tradetracker.com/soap/affiliate"><SOAP-ENV:Body><ns1:${operation}Response>${inner}</ns1:${operation}Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

const ANSWERS = {
  authenticate: '',
  getAffiliateSites: '<affiliateSites SOAP-ENC:arrayType="ns1:AffiliateSite[1]"><item xsi:type="ns1:AffiliateSite"><ID xsi:type="xsd:nonNegativeInteger">520731</ID><name>Parkje weg</name><URL>https://parkjeweg.nl</URL></item><item><ID>9</ID><name>Andere site</name><URL>https://example.com</URL></item></affiliateSites>',
  getConversionTransactions: `<conversionTransactions><item>
    <ID>901</ID><campaign><ID>30138</ID><name>TopParken.nl</name><URL>https://www.topparken.nl</URL><info xsi:nil="true"/></campaign>
    <affiliateSite><ID>520731</ID><name>Parkje weg</name></affiliateSite><campaignProduct><ID>1</ID><name>Boeking</name></campaignProduct>
    <reference>TP-12-kaartje</reference><transactionType>sale</transactionType><transactionStatus>pending</transactionStatus>
    <description xsi:nil="true"/><currency>EUR</currency><commission>14.85</commission><orderAmount>297.00</orderAmount><IP>203.0.113.9</IP>
    <registrationDate>2026-11-23T20:14:05</registrationDate><assessmentDate xsi:nil="true"/><originatingClickDate>2026-11-23T19:58:00</originatingClickDate>
    <rejectionReason xsi:nil="true"/><paidOut>false</paidOut>
    <affiliateSitesPaidOut><affiliateSites><item><affiliateSiteID>520731</affiliateSiteID><paidOut>false</paidOut></item></affiliateSites></affiliateSitesPaidOut>
  </item></conversionTransactions>`,
  getReportCampaign: `<reportCampaign><item><campaign><ID>30138</ID><name>TopParken.nl &amp; co</name></campaign><reportData><uniqueClickCount>12</uniqueClickCount><leadCount>0</leadCount><saleCount>1</saleCount><totalCommission>14.85</totalCommission></reportData></item>
    <item><campaign><ID>2</ID><name>Stil</name></campaign><reportData><uniqueClickCount>0</uniqueClickCount><leadCount>0</leadCount><saleCount>0</saleCount><totalCommission>0</totalCommission></reportData></item></reportCampaign>`,
};

function service(calls) {
  return async (url, { headers, body }) => {
    const operation = headers.SOAPAction.slice(1, -1).split('/').at(-1);
    calls.push({ operation, cookie: headers.Cookie, body });
    return new Response(envelope(operation, ANSWERS[operation]), { headers: operation === 'authenticate' ? { 'Set-Cookie': 'PHPSESSID=abc123; path=/; secure' } : {} });
  };
}

test('reads the bookings and the report of every site, signed in once, and keeps no IP address', async () => {
  const calls = [];
  let saved;
  const read = await updateAffiliateSales({ saveAffiliateSales: async (state) => (saved = state) }, { customerId: '77', passphrase: 'p<&ss' }, { fetcher: service(calls), now: Date.parse('2026-11-24T10:00:00Z') });
  assert.equal(read, 1);
  assert.deepEqual(calls.map((entry) => entry.operation), ['authenticate', 'getAffiliateSites', 'getConversionTransactions', 'getReportCampaign']);
  assert.match(calls[0].body, /<customerID>77<\/customerID><passphrase>p&lt;&amp;ss<\/passphrase>/);
  assert.equal(calls[0].cookie, undefined);
  assert.ok(calls.slice(1).every((entry) => entry.cookie === 'PHPSESSID=abc123'));
  assert.match(calls[2].body, /<affiliateSiteID>520731<\/affiliateSiteID><options><registrationDateFrom>2026-05-28T10:00:00</);
  assert.match(calls[3].body, /<dateFrom>2026-10-25<\/dateFrom><dateTo>2026-11-24<\/dateTo>/);
  assert.deepEqual(saved.transactions, [
    {
      id: '901',
      campaign: 'TopParken.nl',
      product: 'Boeking',
      reference: 'TP-12-kaartje',
      type: 'sale',
      status: 'pending',
      commission: 14.85,
      orderAmount: 297,
      currency: 'EUR',
      registeredAt: '2026-11-23T20:14:05',
      assessedAt: null,
      clickedAt: '2026-11-23T19:58:00',
      rejection: null,
      paidOut: false,
    },
  ]);
  assert.deepEqual(saved.report, [{ campaign: 'TopParken.nl & co', clicks: 12, leads: 0, sales: 1, commission: 14.85 }]);
  assert.doesNotMatch(JSON.stringify(saved), /203\.0\.113/);
});

test('a refusal says what TradeTracker answered, and nothing is stored', async () => {
  const fault = async () =>
    new Response('<SOAP-ENV:Envelope><SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode><faultstring>Invalid credentials</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>', { status: 500 });
  await assert.rejects(updateAffiliateSales({ saveAffiliateSales: () => assert.fail('stored') }, { customerId: '1', passphrase: 'x' }, { fetcher: fault }), /TradeTracker authenticate: Invalid credentials/);
});

test('an empty list is no bookings, and a list keeps its order', () => {
  assert.deepEqual(parseXml('<a><list/><n>1</n></a>'), { a: { list: null, n: '1' } });
  assert.deepEqual(parseXml('<l><item><v>1</v></item><item><v>2</v></item></l>').l.item, [{ v: '1' }, { v: '2' }]);
});

test('a booking is traced to the park and the place on the site of its click', () => {
  const parks = [{ code: 'TP-12', name: 'Résidence Lage Vuursche' }, { code: 'mol_kust', name: 'Molecaten Kust' }];
  const [known, underscored, bare, unknown] = withClickOrigin(
    [{ reference: 'TP-12-kaartje' }, { reference: 'mol-kust-lastminutebalk' }, { reference: 'TP-12' }, { reference: 'topparken-test-proef' }],
    parks,
  );
  assert.deepEqual([known.parkName, known.source], ['Résidence Lage Vuursche', 'kaartje']);
  assert.deepEqual([underscored.parkCode, underscored.source], ['mol_kust', 'lastminutebalk']);
  assert.deepEqual([bare.parkCode, bare.source], ['TP-12', null]);
  assert.deepEqual([unknown.parkCode, unknown.source], [null, null]);
});

test('without both the customer ID and the passphrase there is no account', () => {
  assert.equal(tradeTrackerAccount({ TRADETRACKER_CUSTOMER_ID: '1' }), null);
  assert.deepEqual(tradeTrackerAccount({ TRADETRACKER_CUSTOMER_ID: ' 1 ', TRADETRACKER_PASSPHRASE: 'abc\n' }), { customerId: '1', passphrase: 'abc' });
});
