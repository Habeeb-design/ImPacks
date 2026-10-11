# Gemini prediction genres and ImPacks editions

Observed October 11, 2026 with a read-only request to Gemini production. No account, order, wallet or payment action was performed.

## Official API and observed response

Gemini documents [`GET /v1/prediction-markets/categories`](https://developer.gemini.com/rest-api/prediction-markets/events/list-event-categories). The optional repeated `status` query filters category availability by event status. Its response is an **object** with a `categories` string array, not a bare array. Documentation examples are illustrative and are not a fixed genre taxonomy.

Request: `https://api.gemini.com/v1/prediction-markets/categories?status=active`

Actual successful response:

```json
{"categories":["Live","Sports","Pro Football","Pro Baseball","Midterms","Crypto","Commodities","Economics","Politics","Tech","Business","Weather","Culture"]}
```

The [events endpoint](https://developer.gemini.com/rest-api/prediction-markets/events/list-events) accepts category/status/search filters. Its documented fields include `category`, `subcategory.path`, `tags`, contract `instrumentSymbol` and sports-market metadata. A read-only `events?status=active&limit=2` request succeeded; observed Sports events included `subcategory.path: ["Sports", "Pro Football"]`. This confirms the category endpoint mixes top-level genres and navigation/subgenre labels. Discovery does not prove executable liquidity, order permissions or ImPacks trading support.

## UI grouping

| Edition | Group | Gemini labels |
| --- | --- | --- |
| Crypto | Markets & money | Crypto |
| Sports | Sports | Sports, Pro Football, Pro Baseball |
| Politics | World & culture | Politics, Midterms |
| Economics | Markets & money | Economics |
| Commodities | Markets & money | Commodities |
| Business | Markets & money | Business |
| Tech | World & culture | Tech |
| Culture | World & culture | Culture; Entertainment alias if returned later |
| Weather | World & culture | Weather |
| Chaos | Wildcards | ImPacks mixed pack; no Gemini category mapping |

`Live` is a cross-category collection, not another edition. Future unknown category strings render as a genre preview, without an inferred purchasable pack. Search includes provider subgenre names. Real organization marks already present in `public/images/brands` identify known editions; they illustrate topic areas and do not imply partnerships or the contents of any particular pack.

## Availability and failure behavior

The Packs browser calls the shared typed `GET /api/market-categories` reader for runtime discovery and independently loads the actual ImPacks pack catalog. It shows preview wrappers only for returned provider genres. It never grants purchase access based solely on a category response. Only a pack returned by the ImPacks catalog links to an existing category purchase route.

Current purchasable catalog remains Crypto, Sports and Chaos with simulated payment/execution. Other editions explicitly say they are not available to open and offer a separate link to Gemini Predictions. A failed category request shows an unavailable message with retry and retains only catalog-confirmed editions; there is no hardcoded live-data fallback. The UI reports a successful fetch timestamp and does not invent market counts.

The old `/packs` display-name checkout was removed. Home and Packs share the edition browser; purchases proceed through the account-bound category flow and opened cards belong in Dashboard.

## Further integration

Before opening additional genres, the backend needs a provider-backed eligible contract catalog, current tradable prices, liquidity/exposure constraints, durable ownership and reconciliation, and a defined per-user execution account. Extend shared Theme/Pack contracts, server-owned random selection and API tests together. This discovery feature does not implement those trading capabilities.
