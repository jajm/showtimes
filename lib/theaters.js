const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

module.exports = {
    getTheatersWithin,
};

async function getTheatersWithin (latitude, longitude, distanceInMeters) {
    const theaters = await getTheaters();

    return theaters.filter(t => distance(latitude, longitude, t.latitude, t.longitude) < distanceInMeters);
}

async function getTheaters () {
    const cacheFilePath = process.env.HOME + '/.cache/showtimes/theaters.json';
    if (!fs.existsSync(cacheFilePath)) {
        console.log('Rebuilding cache. This can take a while...');
        fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
        const theaters = await fetchTheaters();
        fs.writeFileSync(cacheFilePath, JSON.stringify(theaters));
    }

    return require(cacheFilePath);
}

async function fetchTheaters () {
    const response = await fetch('https://www.allocine.fr/salle/')
    const html = await response.text();
    const window = new Window();
    const document = window.document;

    document.body.innerHTML = html;
    const departmentLinks = document.querySelectorAll('a[href^="/salle/cinema/departement-"]');
    const theaters = [];
    for (const departmentLink of departmentLinks) {
        const name = departmentLink.getAttribute('title');
        const href = departmentLink.getAttribute('href');
        const found = href.match(/departement-(?<code>\d+)/);
        if (found) {
            const code = found.groups.code;
            const departmentTheaters = await fetchDepartmentTheaters(code);
            for (const theater of departmentTheaters) {
                theaters.push({
                    id: theater.id,
                    name: theater.name,
                    longitude: theater.coordinates[0],
                    latitude: theater.coordinates[1],
                });
            }
        }
    }

    return theaters;
}

async function fetchDepartmentTheaters (code) {
    let page = 1;
    const theaters = [];
    while (true) {
        const response = await fetch(`https://www.allocine.fr/salle/cinema/departement-${code}/?page=${page}`)
        const html = await response.text();
        const window = new Window();
        const document = window.document;
        document.body.innerHTML = html;
        const theaterDivs = document.querySelectorAll('.theater-card .meta-theater')
        if (theaterDivs.length === 0) {
            break;
        }

        for (const theaterDiv of theaterDivs) {
            const dataJson = theaterDiv.querySelector('[data-theater]').getAttribute('data-theater');
            const theater = JSON.parse(dataJson);
            if (theater && theater.id) {
                const address = theaterDiv.querySelector('address');
                if (address) {
                    theater.address = address.textContent.trim();
                    const coordinates = await getCoordinatesFromAddress(theater.address);
                    if (coordinates) {
                        theater.coordinates = coordinates;
                        theaters.push(theater);
                    }
                }
            }
        }
        ++page;
    }

    return theaters;
}

async function getCoordinatesFromAddress (address) {
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}`)
    const data = await response.json();
    if (data && data.features && data.features.length > 0) {
        return data.features[0].geometry.coordinates;
    }
    console.warn('No coordinates found for ' + address);
}

function distance(lat1, lon1, lat2, lon2)
{
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const d = R * c; // in metres

    return d;
}

