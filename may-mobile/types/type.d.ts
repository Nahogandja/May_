import { TextInputProps, TouchableOpacityProps } from "react-native";

declare interface Driver {
  id: string;
  name: string;
  phone?: string | null;
  vehicleDetails?: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  lastLocationUpdate?: string | null;
}

declare interface MarkerData {
  latitude: number;
  longitude: number;
  id: string;
  title: string;

  profile_image_url?: string;
  car_image_url?: string;

  car_seats: number;
  rating: number;

  first_name?: string;
  last_name?: string;

  distanceKm?: number;
  time?: number;
  price?: string;
}

declare interface MapProps {
  destinationLatitude?: number;
  destinationLongitude?: number;
  onDriverTimesCalculated?: (driversWithTimes: MarkerData[]) => void;
  selectedDriver?: string | null;
  onMapReady?: () => void;
}

declare interface Ride {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  pickup: string;
  dropoff: string;
  safe_arrival_code: string;
  safe_arrived: boolean;
  status: string;
  emergency_flag: boolean;
  created_at: string;
  driver_name: string | null;
}

declare interface ButtonProps extends TouchableOpacityProps {
  title: string;
  bgVariant?: "primary" | "secondary" | "danger" | "outline" | "success";
  textVariant?: "primary" | "default" | "secondary" | "danger" | "success";
  IconLeft?: React.ComponentType<any>;
  IconRight?: React.ComponentType<any>;
  className?: string;
}

declare interface GoogleInputProps {
  icon?: string;
  initialLocation?: string;
  containerStyle?: string;
  textInputBackgroundColor?: string;
  handlePress: ({
    latitude,
    longitude,
    address,
  }: {
    latitude: number;
    longitude: number;
    address: string;
  }) => void;
}

declare interface InputFieldProps extends TextInputProps {
  label: string;
  icon?: any;
  secureTextEntry?: boolean;
  labelStyle?: string;
  containerStyle?: string;
  inputStyle?: string;
  iconStyle?: string;
  className?: string;
}

declare interface PaymentProps {
  fullName: string;
  email: string;
  amount: string;
  driverId: string;
  rideTime: number;
}

declare interface LocationStore {
  userLatitude: number | null;
  userLongitude: number | null;
  userAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationAddress: string | null;
  setUserLocation: ({
    latitude,
    longitude,
    address,
  }: {
    latitude: number;
    longitude: number;
    address: string;
  }) => void;
  setDestinationLocation: ({
    latitude,
    longitude,
    address,
  }: {
    latitude: number;
    longitude: number;
    address: string;
  }) => void;
}

declare interface DriverStore {
  drivers: MarkerData[];
  selectedDriver: string | null;
  setSelectedDriver: (driverId: string) => void;
  setDrivers: (drivers: MarkerData[]) => void;
  clearSelectedDriver: () => void;
}

declare interface DriverCardProps {
  item: MarkerData;
  selected: string;
  setSelected: () => void;
}
