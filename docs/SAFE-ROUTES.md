# Safe routes (Safety Map)

- Report a place: Safety Map > Report a place > tap the map > category > Submit. The map refreshes by itself every 15 seconds ("Live").
- Danger zone: nearby negative reports (harassment, poor lighting, isolated area, and so on) that at least `DANGER_MIN_PEOPLE` (default 4) DIFFERENT people filed in the last 90 days. 4 reports from one person do not count. Below the threshold the reports stay as single markers.
- Safe route: Compare routes > set Start and Destination > Find safest route. The shortest route is the red one. If it crosses a danger zone, the server asks the routing service for alternatives and for detours around the zone, and shows the shortest route that avoids all zones as the green one, with kilometres and minutes for both, even when green is longer.
- Sample data: 10 invented reports (SAMPLE_REPORTS=on) along "Try demo trip" (Sealdah to Esplanade): a 5-person zone and a 3-person cluster that stays below the threshold. They are not real incidents and are labelled "Sample".
- Not tested here: the live routing service (the sandbox could not reach it). If it is unreachable, ONLY the demo trip falls back to straight lines, clearly labelled "Demo geometry". Real trips show an error instead.
- The sample coordinates are approximate and were not checked against the real street layout, so the real red route may not pass exactly through the sample zone.
- No route is ever called guaranteed safe.
