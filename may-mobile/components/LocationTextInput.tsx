import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { icons } from "@/constants";

interface LocationTextInputProps {
  icon?: any;
  initialLocation?: string | null;
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

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const LocationTextInput = ({
  icon,
  initialLocation,
  containerStyle,
  textInputBackgroundColor,
  handlePress,
}: LocationTextInputProps) => {
  const [query, setQuery] = useState(initialLocation ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchLocations = async () => {
      if (query.trim().length < 3) {
        setResults([]);
        return;
      }

      setLoading(true);

      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(query)}` +
          `&format=jsonv2` +
          `&limit=5` +
          `&countrycodes=na`;

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "MayMobile/1.0",
          },
        });

        if (!response.ok) {
          throw new Error("Location search failed");
        }

        const data = await response.json();

        setResults(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Location search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchLocations, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const selectLocation = (result: SearchResult) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);

    handlePress({
      latitude,
      longitude,
      address: result.display_name,
    });

    setQuery(result.display_name);
    setResults([]);
  };

  return (
    <View
      className={`rounded-xl ${containerStyle ?? ""}`}
      style={{ zIndex: 100 }}
    >
      <View
        className="flex-row items-center rounded-xl px-3"
        style={{
          backgroundColor: textInputBackgroundColor ?? "white",
        }}
      >
        <Image
          source={icon ?? icons.search}
          className="w-6 h-6"
          resizeMode="contain"
        />

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Where do you want to go?"
          placeholderTextColor="gray"
          className="flex-1 ml-3"
          style={{
            fontSize: 16,
            fontWeight: "600",
            paddingVertical: 14,
          }}
        />

        {loading && <ActivityIndicator size="small" />}
      </View>

      {results.length > 0 && (
        <View
          className="bg-white rounded-xl mt-1"
          style={{
            elevation: 5,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 5,
          }}
        >
          {results.map((result) => (
            <Pressable
              key={result.place_id}
              onPress={() => selectLocation(result)}
              className="px-4 py-4 border-b border-gray-200"
            >
              <Text className="text-sm">
                {result.display_name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

export default LocationTextInput;