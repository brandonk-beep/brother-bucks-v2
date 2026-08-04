const csv = require('csv-parser');
const { Readable } = require('stream');

async function parseSmartMovingCSV(csvContent) {
  return new Promise((resolve, reject) => {
    const results = [];
    const readable = Readable.from([csvContent]);

    readable
      .pipe(csv())
      .on('data', (data) => {
        results.push({
          jobNumber: data['Job Number']?.trim() || '',
          jobRating: parseInt(data['Job Rating']) || null,
          jobDate: data['Job Date']?.trim() || '',
          customerName: data['Customer Name']?.trim() || '',
          customerEmail: data['Customer Email']?.trim() || '',
          actualTimeHours: parseFloat(data['Actual Time Hours']) || 0,
          crewMemberNames: data['Crew Member Names']?.trim() || '',
        });
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

function extractMoversFromCrewString(crewString) {
  // "Calvin Huynh, Emmanuel Aquino, Robert Peterson" -> ["Calvin Huynh", "Emmanuel Aquino", "Robert Peterson"]
  return crewString.split(',').map(name => name.trim()).filter(name => name.length > 0);
}

module.exports = { parseSmartMovingCSV, extractMoversFromCrewString };
