import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoic292byIsImEiOiJjbWFwdndnM3IwMWEyMm1vZGt4dGprZnY0In0.wNlSFE0bQsH-TtIeVqXbRw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

function formatTime(minutes) {
  const d = new Date(0, 0, 0, 0, minutes);
  return d.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

function filterByMinute(tripsByMinuteArray, minuteFilter) {
  if (minuteFilter === -1) {
    return tripsByMinuteArray.flat(); 
  }

  const windowSize = 60; 
  let filteredTrips = [];

  for (let i = -windowSize; i <= windowSize; i++) {
    const currentMinute = (minuteFilter + i + 1440) % 1440;
    filteredTrips.push(...tripsByMinuteArray[currentMinute]);
  }
  return filteredTrips;
}

function computeStationTraffic(stationList, timeFilter = -1) {
  const relevantDepartures = filterByMinute(departuresByMinute, timeFilter);
  const relevantArrivals = filterByMinute(arrivalsByMinute, timeFilter);

  const departuresCount = d3.rollup(relevantDepartures, v => v.length, d => d.start_station_id);
  const arrivalsCount = d3.rollup(relevantArrivals, v => v.length, d => d.end_station_id);

  return stationList.map(station => {
    const id = station.short_name; 
    const departures = departuresCount.get(id) ?? 0;
    const arrivals = arrivalsCount.get(id) ?? 0;
    return {
      ...station, 
      departures: departures,
      arrivals: arrivals,
      totalTraffic: departures + arrivals
    };
  });
}

function getCoords(station) {
  const p = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(p);
  return { cx: x, cy: y };
}


map.on('load', async () => {
  const timeSlider = document.getElementById('time-slider');
  const selectedTimeDisplay = document.getElementById('selected-time'); // Renamed for clarity
  const anyTimeLabel = document.getElementById('any-time');

  const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]); // 0: more arrivals, 0.5: balanced, 1: more departures

  function updateTimeDisplay() {
    const timeFilterValue = +timeSlider.value;
    if (timeFilterValue === -1) {
      selectedTimeDisplay.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTimeDisplay.textContent = formatTime(timeFilterValue);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(timeFilterValue);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });
  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: { 'line-color': 'green', 'line-width': 4, 'line-opacity': 0.5 }
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: { 'line-color': 'green', 'line-width': 4, 'line-opacity': 0.5 }
  });

  const baseStations = (await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')).data.stations;

  await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', trip => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);

    const startMin = minutesSinceMidnight(trip.started_at);
    departuresByMinute[startMin].push(trip);

    const endMin = minutesSinceMidnight(trip.ended_at);
    arrivalsByMinute[endMin].push(trip);

    return trip; 
  });

  let stationsWithInitialTraffic = computeStationTraffic(baseStations);

  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stationsWithInitialTraffic, d => d.totalTraffic) || 1]) // Use || 1 to prevent 0 domain
    .range([0, 25]); 

  const svg = d3.select('#map svg');

  svg.selectAll('circle')
    .data(stationsWithInitialTraffic, d => d.short_name)
    .enter()
    .append('circle')
      .attr('r', d => radiusScale(d.totalTraffic))
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'auto')
      .style('--departure-ratio', d => { 
          if (d.totalTraffic === 0) return 0.5; 
          return stationFlow(d.departures / d.totalTraffic);
      })
    .append('title')
      .text(d => `${d.totalTraffic} trips — ${d.departures} departures, ${d.arrivals} arrivals`);

  function updateScatterPlot(timeFilter) {
    const updatedStationsData = computeStationTraffic(baseStations, timeFilter);

    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
    

    const joinedSelection = svg.selectAll('circle')
        .data(updatedStationsData, d => d.short_name)
        .join(
            enter => enter.append('circle')
                .attr('fill', 'steelblue')
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('pointer-events', 'auto')
                .attr('cx', d => getCoords(d).cx) // Position new circles
                .attr('cy', d => getCoords(d).cy)
                .call(s => s.append('title')), // Add title element for new circles
            update => update,
            exit => exit.remove()
        );

    joinedSelection
        .attr('r', d => radiusScale(d.totalTraffic))
        .style('--departure-ratio', d => { // For Step 6.1
            if (d.totalTraffic === 0) return 0.5;
            return stationFlow(d.departures / d.totalTraffic);
        })
        .select('title') // Update title for both new and existing circles
            .text(d => `${d.totalTraffic} trips — ${d.departures} departures, ${d.arrivals} arrivals`);
  }

  function updatePositions() {
    svg.selectAll('circle')
      .attr('cx', d => getCoords(d).cx)
      .attr('cy', d => getCoords(d).cy);
  }
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
  
  updatePositions(); // Initial position for circles

  updateTimeDisplay(); 
});