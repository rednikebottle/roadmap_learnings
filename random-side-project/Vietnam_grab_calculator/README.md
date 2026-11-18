# Saigon Ride Calculator 🛵

Going on a Vietnam trip, going to be attached to a company, budgeting for transport varried on distance, number of trips, different combination of trips and number of people included. 
Hence I vibe coded this calculator to easily check what would be the best way to go about a day in vietnam
Im attached to a company there so I'll have to travel to work in the mornings but after that its all shopping and relaxing


Estimate **GrabBike / GrabCar** fares between any two places in Ho Chi Minh City, split the cost per person, and add up your daily ride spend.

**Live:** https://rednikebottle.github.io/roadmap_learnings/random-side-project/

## Features
- Search places in HCMC, or tap the map to drop a pickup (A) and drop-off (B)
- Real road distance and drive time, with the route drawn on the map
- Six vehicle types (GrabBike, Bike Plus, Car Saver, Car 4-seat, Car Plus, Car 7-seat) with a live price for each
- Add more people to split the cost. Covering someone else? Set how many shares you pay for
- Each trip is customisable: time of day, surge (rush hour, rain, late night, Tết, or a custom value), round trip, times per day, airport pickup, tolls, tip, extras, distance and time overrides, notes, duplicate and delete
- **+** adds trips, and the totals bar shows the group and your share per day and for your whole stay
- Prices in VND with a USD or SGD conversion
- Trips are saved in your browser. **🔗 Share** copies a link with all your trips in it

## How the fare is worked out
```
ride  = (base for first 2 km + extra km × per-km + minutes × per-minute) × surge   → rounded to 1,000₫
trip  = (ride + tolls + tip) × legs + airport fee + extras
total = trip × vehicles needed × times per day
```
Drive times from OSRM assume empty roads, so they're multiplied by a **traffic factor** (default 1.5) to match Saigon traffic.

### Default rates (HCMC, VND)
| Vehicle | First 2 km | Per km | Per min |
|---|---|---|---|
| GrabBike | 12,500 | 4,300 | 350 |
| GrabBike Plus | 16,000 | 5,300 | 370 |
| GrabCar Saver | 26,700 | 9,100 | 370 |
| GrabCar 4-seat | 29,000 | 10,000 | 450 |
| GrabCar Plus | 34,200 | 12,600 | 530 |
| GrabCar 7-seat | 34,000 | 13,000 | 550 |

All rates and exchange rates can be edited in ⚙️ Settings.

**Sources:**
- [Viettel Store: Grab bao nhiêu tiền 1km? (Dec 2025)](https://viettelstore.vn/tin-tuc/grab-bao-nhieu-tien-1km)
- [Day Trips Vietnam: Grab Prices 2026](https://daytripsvietnam.com/guides/vietnam-grab-prices-2026/)
- [worldforexrates.com (SGD)](https://www.worldforexrates.com/sgd/vnd/1-exchange-rate/)

> These are estimates. This project is not affiliated with Grab, and real fares change with demand.

## Tech
Plain HTML, CSS and JavaScript with no build step.
- [Leaflet](https://leafletjs.com/) and OpenStreetMap tiles for the map
- [Nominatim](https://nominatim.org/) for place search (limited to 1 request per second)
- [OSRM](https://project-osrm.org/) for road routing. If it's down, the app falls back to straight-line distance × 1.3

```
index.html      layout
style.css       mobile-first styles, light and dark mode
js/pricing.js   fare tables and calculateFare()
js/geo.js       place search and routing
js/map.js       Leaflet map
js/app.js       state, UI, localStorage, share links
```

Run it locally with `python3 -m http.server` in this folder, then open http://localhost:8000.
