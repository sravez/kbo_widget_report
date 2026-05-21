// cc113663dc8134c7d019374d37dd6db77cc23fff
// curl -H "Authorization: Bearer cc113663dc8134c7d019374d37dd6db77cc23fff" https://docs.getgrist.com/api/orgs
grist.ready({ requiredAccess: 'full' });

grist.onRecords(table => {

});
grist.onRecord(async record => {

    try {
        //alert(JSON.stringify(record))
        const fleet_id = await getFleetId(record.fleet)
        document.getElementById("fleet").innerHTML = fleet_id

        const dest = document.getElementById("vehicles")
        dest.innerHTML = ""
        const data = await getData(fleet_id, record.start, record.end)
        let k = 0
        let q = 0
        for(const v of data.vehicles) {
            v.qty_sum ||= null
            q += v.qty_sum ?? 0
            if(v.km_new) {
                k += v.km_new - (v.km_old ?? 0)
            }
            dest.innerHTML += `<span class="reg">${v.reg}</span>`
                + `<span class="model">${v.brand} ${v.model}</span>`
                + `<span class="data">${v.km_old?.toLocaleString("fr-FR", {minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? "-"}</span>`
                + `<span class="data">${v.km_new?.toLocaleString("fr-FR", {minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? "-"}</span>`
                + `<span class="data">${v.qty_sum?.toLocaleString("fr-FR", {minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-"}</span>`
        }
        dest.innerHTML += "<span>Total</span>"
            + "<span></span>"
            + "<span></span>"
            + `<span class="data">${k?.toLocaleString("fr-FR", {minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? "-"}</span>`
            + `<span class="data">${q?.toLocaleString("fr-FR", {minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-"}</span>`

    } catch(e) {
        alert(e.message)
    }

});


async function getFleetId(fleet_name) {
    const sql = `SELECT id FROM Fleets WHERE name="${fleet_name}"`
    const f = await executeSqlQuery(sql)
    if (f.length === 1) {
        return f[0].fields.id
    } else {
        return undefined
    }
}

async function getData(fleet_id, start, end) {
    // const sql = `SELECT Vehicles.reg AS reg, MAX(Readings.km) as tkm, SUM(Readings.qty) AS tqty`
    const sql = `SELECT Vehicles.id AS id, Vehicles.reg AS reg, Vehicles.brand, Vehicles.model, Vehicles.present, MAX(Readings.km) as km_new, SUM(Readings.qty) AS qty_sum`
        + ` FROM Vehicles LEFT JOIN Readings`
        + ` ON Vehicles.id = Readings.vehicle`
        + ((start == null) ? "" : ` AND Readings.creation > ${start.getTime()/1000}`)
        + ((end == null)   ? "" : ` AND Readings.creation <= ${end.getTime()/1000}`)
        + ` GROUP BY Vehicles.reg`
        + ` HAVING Vehicles.fleet=${fleet_id}`
        + ((start == null) ? "" : ` AND (Vehicles.restitution IS NULL OR Vehicles.restitution >= ${start.getTime()/1000})`)
        + ((end == null)   ? "" : ` AND (Vehicles.delivery    IS NULL OR    Vehicles.delivery <= ${end.getTime()/1000})`)
        + ` ORDER BY Vehicles.reg`

    try {
        const data = await executeSqlQuery(sql)
        const r = {
            fleet_id: fleet_id,
            date: Date.now(),
            start_date: start,
            end_start: end,
            vehicles: []
        }
        for(const v of data) {
            let km_old = null

            if(start) {
                const sql = "SELECT vehicle, km FROM Readings"
                    + ` WHERE vehicle=${v.fields.id} AND creation <= ${start.getTime()/1000}`
                    + " ORDER BY km DESC"
                    + " LIMIT 1"
                const k = await executeSqlQuery(sql)
                if(k.length > 0) {
                    km_old = k[0].fields.km
                }

            }

            r.vehicles.push({km_old, ...v.fields})
        }
        return r
    } catch(e) {
        alert(e.message)
    }
}

async function getCreation(a_start) {
    const sql = `SELECT id, creation FROM Readings`
    const f = await executeSqlQuery(sql)
    if (f.length > 0) {
        alert(f[0].fields.creation + " / " + a_start)
    } else {
        return undefined
    }
}

/**
 * Exécute une requête SQL
 * @param {string} a_sql Requête SQL
 * @returns {object[]} Tableau des résultats [{fields:{...}}, {fields: {...}}, ...]
 *
 * @see https://support.getgrist.com/api/#tag/sql
 */
async function executeSqlQuery(a_sql) {
    const tokenInfo = await grist.docApi.getAccessToken({ readOnly: false });
    const url = `${tokenInfo.baseUrl}/sql?auth=${tokenInfo.token}&q=${a_sql}`
    const response = await fetch(encodeURI(url), {
        method: 'GET',
        headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!response.ok) {
        throw new Error(`[SQLQUERY_ERROR: ${response.status}] ${response.statusText}`);;
    }
    const data = await response.json()
    return data.records
}

async function getVehicles(fleet_id, start, end) {
    alert("start "+ start)
    const r = []
    const tokenInfo = await grist.docApi.getAccessToken({ readOnly: false });
    const url = `${tokenInfo.baseUrl}/tables/Vehicles/records?auth=${tokenInfo.token}`
        + `&filter={"fleet": [${fleet_id}], "present": [true]}`
    const response = await fetch(encodeURI(url), {
        method: 'GET',
        headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!response.ok) {
        alert("Erreur Vehicles : "+response.statusText);
    }
    const vehicles = await response.json()
    for(const v of vehicles.records) {
        const readings = await getReadings(v.id, start, end)
        r.push({reg: v.fields.reg, km: readings[0].fields.km, qty: readings[0].fields.qty})
    }
    return r
}



