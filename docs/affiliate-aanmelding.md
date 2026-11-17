# Aanmelding bij TradeTracker en Awin

Teksten om te plakken in de aanmeldformulieren, zodra parkjeweg.nl openbaar is. Netwerken bekijken de site voordat ze
je goedkeuren, dus meld je pas aan als de prijzen er weer op staan.

## Programma's

| Aanbieder | Netwerk | Let op |
| --- | --- | --- |
| Landal | TradeTracker of Awin (kies er één) | 3–7% van de huurprijs, cookie 30 dagen |
| Topparken | TradeTracker | |
| Molecaten | TradeTracker | Geen Google Ads op de merknaam |

## Gegevens van de website

- **Naam:** Parkje weg
- **Adres:** https://parkjeweg.nl
- **Taal en land:** Nederlands, Nederland (ook parken in België, Duitsland en Oostenrijk)
- **Categorie:** Reizen › Vakantieparken › Prijsvergelijking
- **Soort site:** contentsite met prijsvergelijking

## Korte omschrijving

Parkje weg vergelijkt elke dag de prijzen van weekendverblijven bij vakantieparken van Landal, Topparken en Molecaten,
en laat zien welke weekenden duidelijk onder de normale prijs van een park zitten.

## Uitgebreide omschrijving

Parkje weg helpt stellen en gezinnen een voordelig weekend weg in een vakantiepark te vinden. De site haalt elke dag de
prijzen op van weekenden (vrijdag tot maandag) en vergelijkt die met de normale prijs van hetzelfde park. Zo zie je in
één oogopslag waar je nu het meeste voordeel hebt.

Elk park heeft een eigen pagina met de prijs per weekend, de voorzieningen, de huisjes en uitjes in de buurt. Daarnaast
zijn er pagina's per regio, land, thema (bijvoorbeeld met zwembad, met hond of met hottub) en per weekend, plus een
overzicht van last-minute weekenden. Bezoekers kunnen een prijsalarm instellen en krijgen een melding als een weekend
goedkoper wordt.

Elke boekknop gaat direct naar de juiste parkpagina of het juiste verblijf bij de aanbieder. De site meldt in de footer
dat links naar aanbieders affiliate-links zijn.

## Hoe we promoten

- Organisch zoekverkeer: eigen pagina's per park, regio, land, thema en weekend.
- Direct verkeer en prijsalarmen (pushmeldingen die bezoekers zelf instellen).
- Geen betaalde zoekadvertenties op merknamen van aanbieders.
- Geen cashback, kortingscodes, e-mailmarketing of incentives.
- Deeplinks naar parkpagina's en verblijven, geen pop-ups of verborgen links.

## Na goedkeuring

Zet per aanbieder het linksjabloon van het netwerk in het Worker-geheim `AFFILIATE_LINKS`, met `{url}` op de plek van
de link naar de aanbieder (zie `server/affiliate.mjs`). Daarna lopen alle boekknoppen via de affiliate-tracking.

Controleer bij het aanmelden welke gegevens het netwerk vraagt, bijvoorbeeld een KvK-nummer of een bankrekening voor de
uitbetaling.
