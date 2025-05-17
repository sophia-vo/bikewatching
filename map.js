import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic292byIsImEiOiJjbWFwdndnM3IwMWEyMm1vZGt4dGprZnY0In0.wNlSFE0bQsH-TtIeVqXbRw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

map.on('load', async () => {
  //code
  map.addSource('boston_route', {
  type: 'geojson',
  data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
});
map.addLayer({
  id: 'boston-bike-lanes',
  type: 'line',
  source: 'boston_route',
  paint: {
    'line-color': 'green',
    'line-width': 4,
    'line-opacity': 0.5,
  },
});
map.addSource('cambridge_route', {
  type: 'geojson',
  data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
});
map.addLayer({
  id: 'cambridge-bike-lanes',
  type: 'line',
  source: 'cambridge_route',
  paint: {
    'line-color': 'green',
    'line-width': 4,
    'line-opacity': 0.5,
  },
});

let stations;
  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    // Await JSON fetch
    const jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData); // Log to verify structure

    stations = jsonData.data.stations;
    console.log('Stations Array:', stations);
  } catch (error) {
    console.error('Error loading JSON:', error); // Handle errors
  }

const trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
//     (trip) => {
//       trip.started_at = new Date(trip.started_at);
//       trip.ended_at   = new Date(trip.ended_at);
//       return trip;
//     }
//   );
  console.log('Loaded trips:', trips.length);

 const departures = d3.rollup(
    trips,
    v => v.length,
    d => d.start_station_id
  );
  const arrivals = d3.rollup(
    trips,
    v => v.length,
    d => d.end_station_id
  );

  stations = stations.map(station => {
    let id = station.short_name;            
    station.departures   = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });
  console.log('Stations enriched with traffic:', stations);

  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

const svg = d3.select('#map').select('svg');

// Append circles to the SVG for each station
const circles = svg
  .selectAll('circle')
  .data(stations, d => d.short_name)
  .enter()
  .append('circle')
  .attr('r', d => radiusScale(d.totalTraffic)) // Radius of the circle
  .attr('fill', 'steelblue') // Circle fill color
  .attr('stroke', 'white') // Circle border color
  .attr('stroke-width', 1) // Circle border thickness
  .attr('opacity', 0.8)
  .attr('pointer-events', 'auto');

  circles.each(function(d) {
    d3.select(this)
      .append('title')
      .text(
        `${d.totalTraffic} trips  —  ${d.departures} departures, ${d.arrivals} arrivals`
      );
  });

// circles.append('title')
//   .text(d => 
//     `${d.totalTraffic} trips  —  ${d.departures} departures, ${d.arrivals} arrivals`
//   );

  // Function to update circle positions when the map moves/zooms
function updatePositions() {
  circles
    .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
    .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
}

// Initial position update when map loads
updatePositions();

// Reposition markers on map interactions
map.on('move', updatePositions); // Update during map movement
map.on('zoom', updatePositions); // Update during zooming
map.on('resize', updatePositions); // Update on window resize
map.on('moveend', updatePositions); // Final adjustment after movement ends

});

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}