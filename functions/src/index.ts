import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as cors from "cors";
import { geohashQueryBounds, distanceBetween, Geopoint } from "geofire-common";

const corsHandler = cors({ origin: true });

admin.initializeApp();
const db = admin.firestore();

export const queryGeopoints = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      const body = request.body.data;
      /* service is a field in users collection */
      const { position, radius, service } = body;
      const { lat, lng } = position;

      const latitude = Number(lat);
      const longitude = Number(lng);
      const center = [latitude, longitude] as Geopoint;
      const radiusInM = radius;

      const bounds = geohashQueryBounds(center, radiusInM);
      const promises = [];
      for (const b of bounds) {
        let query = db.collection("users") as FirebaseFirestore.Query;
        query = query.where("userType", "==", "provider");
        /* query by service field if passed in the api call */
        if (service) query = query.where("service", "==", service);
        query = query.orderBy("geohash").startAt(b[0]).endAt(b[1]);
        promises.push(query.get());
      }

      const matchedUsers = await Promise.all(promises)
        .then((snapshots) => {
          const matchingDocs = [];
          for (const snap of snapshots) {
            for (const doc of snap.docs) {
              const location = doc.get("location");
              const [lat, lng] = location;

              if (location && lat && lng) {
                const distanceInKm = distanceBetween([lat, lng], center);
                const distanceInM = distanceInKm * 1000;
                if (distanceInM <= radiusInM) {
                  matchingDocs.push(doc.data());
                }
              }
            }
          }

          return matchingDocs;
        })
        .then((matchingDocs) => {
          return matchingDocs;
        });

      response.status(200).json({
        data: matchedUsers,
        success: true,
        status: "success",
      });
    } catch (error) {
      response.status(500).json({
        data: null,
        success: false,
        status: "error",
      });
    }
  });
});
