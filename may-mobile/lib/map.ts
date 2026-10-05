import { Driver, MarkerData } from "@/types/type";

export const calculateDriverTimes = async ({
  markers,
  userLatitude,
  userLongitude,
  destinationLatitude,
  destinationLongitude,
}: {
  markers: MarkerData[];
  userLatitude: number | null;
  userLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}) => {
  if (
    userLatitude === null ||
    userLongitude === null ||
    destinationLatitude === null ||
    destinationLongitude === null
  ) {
    return;
  }

  try {
    // Passenger route
    const passengerRouteUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${userLongitude},${userLatitude};` +
      `${destinationLongitude},${destinationLatitude}` +
      `?overview=false`;

    const passengerResponse = await fetch(passengerRouteUrl);

    if (!passengerResponse.ok) {
      throw new Error("Passenger route request failed");
    }

    const passengerData = await passengerResponse.json();

    const passengerDuration =
      passengerData.routes?.[0]?.duration ?? 0;

    // Driver → passenger routes
    const driverTimes = await Promise.all(
      markers.map(async (marker) => {
        try {
          const driverRouteUrl =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${marker.longitude},${marker.latitude};` +
            `${userLongitude},${userLatitude}` +
            `?overview=false`;

          const response = await fetch(driverRouteUrl);

          if (!response.ok) {
            return {
              ...marker,
              time: undefined,
              price: undefined,
            };
          }

          const data = await response.json();

          const driverDuration =
            data.routes?.[0]?.duration ?? 0;

          const totalTime =
            (driverDuration + passengerDuration) / 60;

          const price = (totalTime * 0.5).toFixed(2);

          return {
            ...marker,
            time: totalTime,
            price,
          };
        } catch (error) {
          console.warn(
            `Could not calculate route for driver ${marker.id}`,
            error
          );

          return {
            ...marker,
          };
        }
      })
    );

    return driverTimes;
  } catch (error) {
    console.error("Error calculating driver times:", error);
    return markers;
  }
};