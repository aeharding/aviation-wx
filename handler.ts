import booleanIntersects from "@turf/boolean-intersects";
import { point, FeatureCollection } from "@turf/helpers";
import axios from "axios";
import { addHours, startOfDay, startOfHour } from "date-fns";
import uniqBy from "lodash";

export async function query(
  event: AWSLambda.APIGatewayEvent
): Promise<AWSLambda.APIGatewayProxyResultV2> {
  const lat = Number(event.queryStringParameters?.lat);
  const lon = Number(event.queryStringParameters?.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return {
      statusCode: 405,
    };
  }

  try {
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "FeatureCollection",
        features: (await getAll()).features.filter((feature) => {
          try {
            return booleanIntersects(feature, point([lon, lat]));
          } catch (e) {
            // Sometimes has:
            // `geometry: { type: 'Polygon', coordinates: [ [] ] }`
            return false;
          }
        }),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error processing" }),
    };
  }
}

async function getAll() {
  const now = new Date();

  const currentDate = addHours(startOfHour(now), 1);
  const outlookDate = addHours(startOfHour(now), 3);

  const airmet0Date = addHours(
    startOfDay(now),
    now.getUTCHours() - (now.getUTCHours() % 3)
  );
  const airmet1Date = addHours(
    startOfDay(now),
    3 + now.getUTCHours() - (now.getUTCHours() % 3)
  );
  const airmet2Date = addHours(
    startOfDay(now),
    6 + now.getUTCHours() - (now.getUTCHours() % 3)
  );
  const airmet3Date = addHours(
    startOfDay(now),
    9 + now.getUTCHours() - (now.getUTCHours() % 3)
  );

  const [sigmet, outlook, airmet0, airmet1, airmet2, airmet3, cwa] =
    await Promise.all([
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/SigmetJSON.php",
        {
          params: {
            date: formatDate(currentDate),
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/SigmetJSON.php",
        {
          params: {
            date: formatDate(outlookDate),
            outlook: "on",
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/GairmetJSON.php",
        {
          params: {
            level: "sfc",
            fore: -1,
            date: airmet0Date,
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/GairmetJSON.php",
        {
          params: {
            level: "sfc",
            fore: -1,
            date: airmet1Date,
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/GairmetJSON.php",
        {
          params: {
            level: "sfc",
            fore: -1,
            date: airmet2Date,
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/GairmetJSON.php",
        {
          params: {
            level: "sfc",
            fore: -1,
            date: airmet3Date,
          },
        }
      ),
      axios.get<FeatureCollection>(
        "https://d3akp0hquhcjdh.cloudfront.net/cgi-bin/json/CwaJSON.php"
      ),
    ]);

  return {
    type: "FeatureCollection",
    features: uniqBy(
      [
        ...sigmet.data.features,
        ...outlook.data.features,
        ...airmet0.data.features,
        ...airmet1.data.features,
        ...airmet2.data.features,
        ...airmet3.data.features,
        ...cwa.data.features,
      ],
      "id"
    ),
  };
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}${date
    .getUTCHours()
    .toString()
    .padStart(2, "0")}00`;
}
