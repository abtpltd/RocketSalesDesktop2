# Next modules to migrate (proposal)

Rule for every module: **the desktop page must show exactly what the web page shows.** So each endpoint calls the same
model method with the same arguments as the web handler, applies the same permission check, and the same formatting.
No new calculation. New routes only, under `/api/v1/desktop/`, and each one is tried against a copy of the web page's output
before release.

Common to all: access-token check (`DesktopService.authenticate`), `check_user_allowed`, the handler's own
`@authorize_access_request` index, JSON error envelope, and a cached copy for offline where the data is a read-only list.

Order (smallest risk first). I verified the routes and models named below in the code; the column lists come from the web templates.

## 1. Orders list (`/OrderGrid`)
- **Web today:** `order.OrderGrid.post` calls `ndbmodels.Order.search_results(fromdate, todate, [customer key], status, parent_code, hq, areaList)`
  and returns rendered `OrderFilter.html` inside JSON.
- **Endpoint:** `GET /api/v1/desktop/orders?from=&to=&client=&status=&hq=`. Default range is the current month in the company's
  country time (`date_api.getLocalDateTimeByCountry`, `get_first_day`, `get_last_day`), exactly as the handler does.
- **Fields (from `UI5.3/OrderFilter.html`):** key, order_number, create_time (`%Y-%m-%d %H:%M:%S`), order_date (`%Y-%m-%d`),
  super_market_code, super_market_name, onhold_remark, sub_total and grand_total (as numbers; display with `format_currency` = 2 decimals),
  status, and the product name, qty, rate and group lists.
- **Must stay identical:** the same date defaults, the `newWebView` template choice does not matter (data only), the same
  status filter values, the same order and totals. Offline: read-only.
- **Check first:** which permission bit guards `/OrderGrid`; the web handler has none visible in the lines I read, so confirm in `ActionSupport`/menu use before copying it.

## 2. Order details (`/OrderDetails`)
- Reads one order by key. Endpoint `GET /api/v1/desktop/orders/<key>`. Read-only; leave `SEND_MAIL`, `REFRESH_CUSTOMER` and approval to the classic window (they change data).

## 3. Customers and products lists (`/master/...`, `Report.ProductListing`)
- Read-only lists with search. The `/master/Product*` handlers mix page rendering and data; I would first find the JSON-returning
  helpers they call (for example `GetCustomerJSON` for customers) and reuse those. Open question: which list each company uses.

## 4. Attendance and visits reports (`/Report/Attendance`, `/Report/DCR`)
- Date-range reports. Same approach as orders: call the report's own query, return rows. Daily call report numbers feed the KPI cards, so compare against the dashboard.

## 5. Stock position (`/Utility/StockSheet` and the stock report)
- Read-only; needs a decision on the warehouse filter and the unit of measure shown. Do after lists are proven.

## Not planned
Anything that creates or changes data (create order, approve, transfers, payments, settings) stays in the classic window until
the read-only pages have run in production for a while. Each of those needs its own validation review.

## Before starting module 1
1. Run the whole desktop path against a test company on a deployed test version (nothing here has touched a real Datastore yet).
2. Export `domain`, `menu`, `newWebView`, `country` and `package.count` for each company so menus and enabled modules are checked per company.
3. Decide the generic list endpoint shape (paging, sorting) once, so modules 1 to 5 share it.
