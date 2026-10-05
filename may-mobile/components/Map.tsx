import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Camera,
  Map,
  Marker,
} from "@maplibre/maplibre-react-native";

import { useFetch } from "@/lib/fetch";
import { calculateDriverTimes } from "@/lib/map";
import { useDriverStore, useLocationStore } from "@/store";
import { Driver, MarkerData } from "@/types/type";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

const MapComponent = () => {
  const {
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();

  const { selectedDriver, setDrivers } = useDriverStore();

  /*
   * Get nearby drivers from the May backend.
   *
   * The backend receives the passenger's current location
   * and returns nearby available drivers.
   */
  const nearbyDriversEndpoint =
    userLatitude !== null && userLongitude !== null
      ? "/api/rides/nearby-drivers?lat=" +
        userLatitude +
        "&lng=" +
        userLongitude +
        "&radius=10&limit=20"
      : null;

  const {
    data: drivers,
    loading,
    error,
  } = useFetch<Driver[]>(nearbyDriversEndpoint);

  /*
   * Drivers converted into map markers.
   */
  const [markers, setMarkers] = useState<MarkerData[]>([]);

  /*
   * Convert May Driver objects into MarkerData objects.
   *
   * Driver:
   *   id
   *   name
   *   latitude
   *   longitude
   *   distanceKm
   *
   * MarkerData additionally requires:
   *   title
   *   car_seats
   *   rating
   */
  useEffect(() => {
    if (Array.isArray(drivers)) {
      const newMarkers: MarkerData[] = drivers.map((driver) => ({
        id: driver.id,
        latitude: driver.latitude,
        longitude: driver.longitude,
        title: driver.name,

        /*
         * Temporary defaults.
         *
         * These can later come directly from the backend
         * once driver vehicle/rating information is included
         * in the nearby-drivers response.
         */
        car_seats: 4,
        rating: 5,

        distanceKm: driver.distanceKm,
      }));

      setMarkers(newMarkers);
    } else {
      setMarkers([]);
    }
  }, [drivers]);

  /*
   * Calculate estimated driver arrival times when a
   * destination has been selected.
   */
  useEffect(() => {
    if (
      markers.length > 0 &&
      destinationLatitude !== null &&
      destinationLongitude !== null &&
      userLatitude !== null &&
      userLongitude !== null
    ) {
      calculateDriverTimes({
        markers,
        userLatitude,
        userLongitude,
        destinationLatitude,
        destinationLongitude,
      }).then((driversWithTimes) => {
        if (driversWithTimes) {
          setDrivers(driversWithTimes);
        }
      });
    } else {
      setDrivers(markers);
    }
  }, [
    markers,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    setDrivers,
  ]);

  /*
   * MapLibre uses:
   *
   * [longitude, latitude]
   */
  const initialCoordinate = useMemo<[number, number]>(() => {
    if (userLongitude !== null && userLatitude !== null) {
      return [userLongitude, userLatitude];
    }

    /*
     * Windhoek fallback.
     */
    return [17.0658, -22.5609];
  }, [userLatitude, userLongitude]);

  /*
   * Wait until the passenger's location is available.
   */
  if (userLatitude === null || userLongitude === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" />

        <Text style={styles.waitingText}>
          Waiting for location...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE}
          androidView="texture"
      >
        {/* Camera */}
        <Camera
          initialViewState={{
            center: initialCoordinate,
            zoom: 13,
          }}
        />

        {/* Passenger location */}
        <Marker
          id="passenger"
          lngLat={[userLongitude, userLatitude]}
          anchor="center"
        >
          <View style={styles.passengerMarker}>
            <View style={styles.passengerDot} />
          </View>
        </Marker>

        {/* Destination */}
        {destinationLatitude !== null &&
          destinationLongitude !== null && (
            <Marker
              id="destination"
              lngLat={[
                destinationLongitude,
                destinationLatitude,
              ]}
              anchor="center"
            >
              <View style={styles.destinationMarker}>
                <Text style={styles.destinationText}>
                  ●
                </Text>
              </View>
            </Marker>
          )}

        {/* Nearby May drivers */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            id={`driver-${marker.id}`}
            lngLat={[
              marker.longitude,
              marker.latitude,
            ]}
            anchor="center"
          >
            <View
              style={[
                styles.driverMarker,
                selectedDriver === marker.id &&
                  styles.selectedDriverMarker,
              ]}
            >
              <Text style={styles.driverText}>
                🚗
              </Text>
            </View>
          </Marker>
        ))}
      </Map>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" />
        </View>
      )}

      {/* Backend/API error */}
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>
            Drivers: {error}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  waitingText: {
    marginTop: 8,
    color: "#666",
  },

  /*
   * Passenger marker
   */
  passengerMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },

  passengerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#0286FF",
  },

  /*
   * Driver marker
   */
  driverMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },

  selectedDriverMarker: {
    borderWidth: 3,
    borderColor: "#0286FF",
  },

  driverText: {
    fontSize: 18,
  },

  /*
   * Destination marker
   */
  destinationMarker: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 5,
  },

  destinationText: {
    fontSize: 22,
  },

  /*
   * Loading overlay
   */
  loadingOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 8,
    borderRadius: 20,
  },

  /*
   * Error overlay
   */
  errorOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 8,
    borderRadius: 8,
  },

  errorText: {
    color: "red",
    fontSize: 12,
  },
});

export default MapComponent;