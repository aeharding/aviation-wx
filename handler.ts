import booleanIntersects from "@turf/boolean-intersects";
import { point, FeatureCollection } from "@turf/helpers";
import axios from "axios";
import { addHours, startOfHour } from "date-fns";
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
  const currentDate = addHours(startOfHour(new Date()), 1);
  const outlookDate = addHours(startOfHour(new Date()), 3);

  const [sigmet, outlook, airmet, cwa] = await Promise.all([
    axios.get<FeatureCollection>(
      "https://www.aviationweather.gov/cgi-bin/json/SigmetJSON.php",
      {
        params: {
          date: `${currentDate.getUTCFullYear()}${(
            outlookDate.getUTCMonth() + 1
          )
            .toString()
            .padStart(2, "0")}${currentDate
            .getUTCDate()
            .toString()
            .padStart(2, "0")}${currentDate
            .getUTCHours()
            .toString()
            .padStart(2, "0")}00`,
        },
      }
    ),
    axios.get<FeatureCollection>(
      "https://www.aviationweather.gov/cgi-bin/json/SigmetJSON.php",
      {
        params: {
          date: `${outlookDate.getUTCFullYear()}${(
            outlookDate.getUTCMonth() + 1
          )
            .toString()
            .padStart(2, "0")}${outlookDate
            .getUTCDate()
            .toString()
            .padStart(2, "0")}${outlookDate
            .getUTCHours()
            .toString()
            .padStart(2, "0")}00`,
          outlook: "on",
        },
      }
    ),
    axios.get<FeatureCollection>(
      "https://www.aviationweather.gov/cgi-bin/json/AirmetJSON.php"
    ),
    axios.get<FeatureCollection>(
      "https://www.aviationweather.gov/cgi-bin/json/CwaJSON.php"
    ),
  ]);

  return {
    type: "FeatureCollection",
    features: uniqBy(
      [
        ...sigmet.data.features,
        ...outlook.data.features,
        ...airmet.data.features,
        ...cwa.data.features,
      ],
      "id"
    ),
  };
}
