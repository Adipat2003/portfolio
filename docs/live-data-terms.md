# Chicago live-data terms review

Status: complete for the four candidate sources, 2026-10-23. Research only; no
feed was integrated, no key was requested, and no request policy here changes
the site. This closes issue #6 and unblocks the Phase 4 Chicago data proxy
design. One follow-up probe remains: the Divvy GBFS feed itself rejects
requests from this host, so its license fields could not be read (see Divvy
section).

Sources reviewed: CTA Train Tracker, Divvy (GBFS), NWS, and the City of
Chicago data portal. Every load-bearing statement carries a citation to the
page it came from; verbatim supporting text is in the Sources section.

## What each feed would power

- CTA Train Tracker: trains in motion along the two Atlas routes and arrival
  times at the stations.[1][2]
- Divvy GBFS: dock availability as small points of light near chosen
  neighborhoods.[7]
- NWS: the sky, river, and ambient palette reacting to real Chicago weather.[3]
- City datasets: landmark records and neighborhood-scale context, already
  used statically today for landmarks and curated notes.

## CTA Train Tracker

**Access.** Registration and receipt of an API key is required for use of the
Train Tracker API.[6] Using the API requires agreeing to the Developer
License Agreement and Terms of Use, which governs all CTA electronic data
including Train Tracker data.[5][6] The key must stay server-side per the
repo's secrets rule, which also matches the API's registration model.

**License.** The agreement permits developer use of CTA data with named
restrictions.[5] A credit line is optional; if one is included for Train
Tracker data it should read: "CTA Train Tracker data provided by Chicago
Transit Authority. The CTA Train Tracker logo is a trademark of Chicago
Transit Authority" or similar descriptive language.[5]

**Continuity.** CTA reserves the right to discontinue posting the data,
temporarily or permanently, with or without notice, and accepts no liability
for doing so.[5] On termination or expiration of the agreement, all CTA data
must be promptly deleted and the brand assets discontinued.[5] Enforcement
can include disabling the application and restricting access.[5]

**Integration requirements.** Cache server-side with short TTLs so the
Atlas never queries CTA per visitor; degrade to the authored static map when
the feed is unavailable, since CTA may discontinue the data with or without
notice.[5] Keep the credit string, if used, in the content model so both
facades render it identically, with the wording the agreement names for Train
Tracker data.[5] Never present the feed as an official CTA product. No
published rate limit was located in the reviewed documentation, so the
proxy must enforce its own conservative request budget.

## Divvy (GBFS live station feed)

**Access.** Divvy publishes live station info on its GBFS JSON feed.[7] The
feed is the interface the operator provides for that purpose; the Divvy Data
License Agreement prohibits accessing the data by means other than the
provided interface and prohibits circumventing access restrictions.[8]

**License.** The City of Chicago owns all right, title, and interest in the
Divvy data.[8] The Data License Agreement grants a non-exclusive, royalty-free,
limited, perpetual license to access, reproduce, analyze, copy, modify,
distribute in a product or service, and use the data for any lawful
purpose.[8] It prohibits hosting, streaming, publishing, distributing,
sublicensing, or selling the data as a stand-alone dataset, with an exception
for source material in analyses, reports, or studies distributed for
non-commercial purposes.[8] It also prohibits stating or implying affiliation
or endorsement by Bikeshare and restricts use of the DIVVY marks, which are
owned by the City of Chicago.[8]

**The unverified part.** This host could not read the feed: gbfs.divvybikes.com
returned S3 AccessDenied from this network, so the license_id or license_url
fields in system_information.json were not observed.[unverified] The GBFS
specification recommends all datasets be offered under an open data license
and says a blank or omitted license_id and license_url indicates the feed is
provided under the Creative Commons Universal Public Domain Dedication.[9]
The proxy must read the feed's own license fields on first contact and record
them here before any Divvy data reaches the site. That probe needs a network
the feed accepts, for example the local Mac session or the chosen Node host.

**Integration requirements.** Respect the feed's ttl and last_updated fields
for caching rather than fixed intervals, per the GBFS output format.[9]
Aggregate to neighborhood scale so the Atlas never republishes the dataset
stand-alone, which the license prohibits outside non-commercial
analyses.[8] No Divvy marks without written permission, and no implication of
affiliation or endorsement by Bikeshare.[8] Treat the license as revocable at
any time for any reason, because it is.[8]

## NWS (weather)

**Access.** The NWS API at api.weather.gov provides forecasts, alerts, and
observations with no key.[3] The API was designed with a cache-friendly
approach that expires content based on the information life cycle, so the
proxy should honor the expiry headers it returns.[3] The API asks for a
User-Agent string identifying the application, with contact information so
NWS can reach the operator in a security event, and states this will be
replaced with an API key in the future.[3]

**License.** NWS web page information is in the public domain unless
specifically noted otherwise and may be used without charge for any lawful
purpose, provided the user does not claim it as their own, does not use it
in a way implying endorsement or affiliation with NOAA/NWS, and does not
modify it and present it as official government material.[4]

**Integration requirements.** This is the cleanest source of the four.
Identify the proxy in the User-Agent with a contact address, as the API
requests.[3] Cache per the response expiry the API was designed around.[3]
Keep the no-endorsement rule by never implying NOAA or NWS sponsors the
site.[4] Label derived visuals as approximations, not official forecasts, and
never present modified content as official government material.[4]

## City of Chicago data portal

**Access.** Datasets are served through the portal's documented interfaces
(OData and exports); dataset pages state licensing as "See Terms of Use".[10]
The portal FAQ points to the official terms linked from the portal footer.[10]

**License.** The City provides the data voluntarily as a public service and
makes no warranty, representation, or guaranty as to content, accuracy,
timeliness, or completeness, on an "as is" basis.[10] Any application using
the data must include the City's required disclaimer at the site where the
application can be accessed or downloaded, verbatim: "This site provides
applications using data that has been modified for use from its original
source, www.cityofchicago.org, the official website of the City of Chicago.
The City of Chicago makes no claims as to the content, accuracy, timeliness,
or completeness of any of the data provided at this site. The data provided
at this site is subject to change at any time. It is understood that the data
provided at this site is being used at one's own risk."[10] Applications must
also comply with any additional terms set by the contributing City department,
including extra citations or disclaimers.[10] The City may require a user to
terminate any display or use of the data for any reason and reserves the
right to discontinue availability at any time.[10]

**Integration requirements.** The required disclaimer is mandatory for any
application surface using city data, so if the Atlas ever renders city
datasets beyond today's hand-authored landmark notes, the site footer or the
Chicago section must carry the disclaimer text.[10] Per-dataset attribution
must be checked on each dataset page before adoption, because departments
can set additional terms and disclaimers.[10]

## Cross-cutting rules for the Phase 4 proxy

- All four sources reserve the right to discontinue or modify their data with
  little or no notice, so every live surface must degrade to the authored
  static world with no error state a visitor can see.[5][8][10]
- Keys and identifiers (CTA key, NWS User-Agent contact) live in the Node
  service only, consistent with the existing secrets rule.
- No scraping: only the documented interfaces the terms name or provide
  (CTA API with a key, the Divvy GBFS feed, api.weather.gov, portal
  OData/exports).[5][8]
- Cache according to each source's own freshness signals: NWS expiry headers,
  GBFS ttl, conservative budgets for CTA.[3][9]
- Attribution and disclaimers are content, not code: they belong in the
  content model so both facades render them identically, per the one content
  model rule.
- Re-verify each source's terms at integration time and before any public
  release; this review is a snapshot dated 2026-10-23.

## Verdict

NWS is integration-ready today. CTA is integration-ready once a key is
registered and the agreement accepted, with graceful degradation designed in.
City datasets are usable with the mandatory disclaimer carried on the site.
Divvy is blocked on one probe: read the live feed's license fields from an
allowed network and record them here before use.

## Sources

[1] https://www.transitchicago.com/developers
    > "Provides up-to-the-minute arrival predictions about trains on the CTA system via the CTA Train Tracker SM service."
[2] https://www.transitchicago.com/developers/traintracker.aspx
    > "A full set of documentation is available on a Web page and in PDF format, including details about API query string parameters and more."
[3] https://www.weather.gov/documentation/services-web-api
    > "The National Weather Service (NWS) API allows developers access to critical forecasts, alerts, and observations, along with other weather data."
    > "The API was designed with a cache-friendly approach that expires content based upon the information life cycle."
[4] https://www.weather.gov/disclaimer
    > "The information on National Weather Service (NWS) Web pages are in the public domain, unless specifically noted otherwise, and may be used without charge for any lawful purpose"
[5] https://www.transitchicago.com/developers/terms.aspx
    > "This Developer License Agreement and Terms of Use (“Agreement”) governs the use by developers and third parties (“you”) of electronic data owned and maintained by Chicago Transit Authority (“CTA,” “we” or “us”), including, but not limited to, CTA Bus Tracker data, CTA Train Tracker data, transitchicago.com Alerts data, General Transit Feed Specification (“GTFS”) and Scheduled Service data (collectively, “CTA Data”)."
    > "If you elect to include a credit line, it should read: “CTA Train Tracker data provided by Chicago Transit Authority. The CTA Train Tracker logo is a trademark of Chicago Transit Authority” or similar descriptive language."
    > "Upon any termination or expiration of this Agreement, you will promptly delete all CTA Data from your application, computer systems or other storage devices and discontinue all use of the CTA Brand Assets."
    > "CTA reserves the right at any time and from time to time to discontinue posting the CTA Data (or any part thereof), temporarily or permanently, with or without notice to you."
[6] https://www.transitchicago.com/developers/ttdocs
    > "Registration and receipt of an API key is required for use of this API."
    > "to use this API, you must agree to our Developers License Agreement and Terms of Use"
[7] https://divvybikes.com/system-data
    > "You can get live station info on our station GBFS JSON feed"
[8] https://www.divvybikes.com/data-license-agreement
    > "Bikeshare hereby grants to you a non-exclusive, royalty-free, limited, perpetual license to access, reproduce, analyze, copy, modify, distribute in your product or service and use the Data for any lawful purpose"
    > "Host, stream, publish, distribute, sublicense, or sell the Data as a stand-alone dataset; provided, however, you may include the Data as source material, as applicable, in analyses, reports, or studies published or distributed for non-commercial purposes;"
    > "Access the Data by means other than the interface Bikeshare provides or authorizes for that purpose;"
    > "The City of Chicago owns all right, title, and interest in the Data."
[9] https://gbfs.org/specification
    > "It is RECOMMENDED that all GBFS data sets be offered under an open data license."
    > "If the license_id and license_url fields are blank or omitted, this indicates that the feed is provided under the Creative Commons Universal Public Domain Dedication"
[10] https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html
    > "The City of Chicago (“City”) voluntarily provides the data on this website as a service to the public. The City makes no warranty, representation, or guaranty as to the content, accuracy, timeliness, or completeness of any of the data provided at this website."
    > "Include the following disclaimer at the site where the software application, or other secondary or derivative application can be accessed or downloaded:"
    > "“This site provides applications using data that has been modified for use from its original source, www.cityofchicago.org, the official website of the City of Chicago. The City of Chicago makes no claims as to the content, accuracy, timeliness, or completeness of any of the data provided at this site. The data provided at this site is subject to change at any time. It is understood that the data provided at this site is being used at one’s own risk.”"
    > "Comply with any additional Terms of Use set forth by the City agency or department providing data used by the software application, or other secondary or derivative application, including, without limitation, requirements to include additional citations or disclaimers at the site where the application can be accessed or downloaded."
