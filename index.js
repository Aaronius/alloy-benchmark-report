#!/usr/bin/env node

const got = require('got');
const median = require('median');

const regions =  [
  {
    name: 'East Coast',
    reportHost: '52.167.228.34',
    reportDate: '2020-11-16-21-51-40',
    pageHost: 'alloyio.com',
  },
  {
    name: 'West Coast',
    reportHost: '20.51.127.39',
    reportDate: '2020-11-16-21-51-37',
    pageHost: 'west.alloyio.com',
  },
  {
    name: 'Europe',
    reportHost: '52.167.228.34',
    reportDate: '2020-11-16-21-51-51',
    pageHost: 'europe.alloyio.com',
  }
];

const scenarios = [
  {
    name: 'Visitor + Analytics + Target + Audience Manager',
    pages: [
      {
        name: 'Control',
        filename: 'control.html'
      },
      {
        name: 'Alloy Standalone',
        filename: 'alloy-standalone.html'
      },
      {
        name: 'Legacy Standalone',
        filename: 'legacy-standalone.html'
      },
      {
        name: 'Alloy Launch',
        filename: 'alloy-launch.html'
      },
      {
        name: 'Legacy Launch',
        filename: 'legacy-launch.html'
      },
    ]
  },
  {
    name: 'Visitor + Analytics',
    pages: [
      {
        name: 'Control',
        filename: 'control-analytics.html'
      },
      {
        name: 'Alloy Standalone',
        filename: 'alloy-analytics-standalone.html'
      },
      {
        name: 'Legacy Standalone',
        filename: 'legacy-analytics-standalone.html'
      },
      {
        name: 'Alloy Launch',
        filename: 'alloy-analytics-launch.html'
      },
      {
        name: 'Legacy Launch',
        filename: 'legacy-analytics-launch.html'
      },
    ]
  }
];

const getStatsForPage = async (pageReportUrl) => {
  const timesToLargestContentfulPaint = [];
  const timesToBeaconSent = [];
  let uncompressedJavaScriptSize;
  let compressedJavaScriptSize;

  const harUrl = `${pageReportUrl}/data/browsertime.har`;
  const harResponse = await got(harUrl);
  const har = JSON.parse(harResponse.body);

  har.log.pages.forEach(page => {
    timesToLargestContentfulPaint.push(page.pageTimings._largestContentfulPaint);

    const beaconEntry = har.log.entries.find(entry => {
      return entry.pageref === page.id && (entry.request.url.includes('/b/ss') || entry.request.url.includes('/v1/interact'));
    })

    if (beaconEntry) {
      timesToBeaconSent.push(new Date(beaconEntry.startedDateTime) - new Date(page.startedDateTime));
    }

    const javaScriptEntries = har.log.entries.filter(entry => {
      return entry.pageref === page.id && entry.response.content.mimeType === 'application/javascript';
    })

    if (!uncompressedJavaScriptSize) {
      let totalUncompressedJavaScriptSize = 0;
      let totalCompressedJavaScriptSize = 0;

      javaScriptEntries.forEach(javaScriptEntry => {
        totalUncompressedJavaScriptSize += javaScriptEntry.response.content.size;
        totalCompressedJavaScriptSize += (javaScriptEntry.response.content.size - javaScriptEntry.response.content.compression);
      });

      uncompressedJavaScriptSize = totalUncompressedJavaScriptSize;
      compressedJavaScriptSize = totalCompressedJavaScriptSize;
    }
  });

  return {
    medianTimeTolargestContentfulPaint: Math.round(median(timesToLargestContentfulPaint)),
    medianTimeToBeaconSent: Math.round(median(timesToBeaconSent)),
    uncompressedJavaScriptSize: uncompressedJavaScriptSize,
    compressedJavaScriptSize: compressedJavaScriptSize
  }
}

const produceReport = async () => {
  for (const scenario of scenarios) {
    let tuplesByMetric = {};

    for (const region of regions) {
      for (const page of scenario.pages) {

        // FIXME: Remove when the Europe report gets moved to the right location.
        const pageHostSegment = region.name === 'Europe' ? `europe/${region.pageHost}` : region.pageHost;
        const reportUrl = `http://${region.reportHost}/sitespeed-result/${pageHostSegment}/${region.reportDate}/pages/${region.pageHost}/perf/${page.filename}`
        console.log('Gathering data from report:', reportUrl);

        let statsForPage;
        try {
          statsForPage = await getStatsForPage(reportUrl);
        } catch (e) {
          console.error('Error gathering data from report:', reportUrl, e);
          continue;
        }

        Object.keys(statsForPage).forEach(metric => {
          let tuples = tuplesByMetric[metric];

          if (!tuples) {
            tuples = [];
            tuplesByMetric[metric] = tuples;
          }

          let tuple = tuples.find(candidateRow => candidateRow.pageName === page.name);

          if (!tuple) {
            tuple = {
              pageName: page.name
            };
            tuples.push(tuple);
          }

          tuple[region.name] = statsForPage[metric];
        })
      }
    }

    console.log(scenario.name);
    Object.keys(tuplesByMetric).forEach(metric => {
      console.log(metric);
      console.table(tuplesByMetric[metric]);
    })
  }
}

(async () => {
  await produceReport();
})();
