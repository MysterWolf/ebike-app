import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { SpeedMonitor } from '../components/SpeedMonitor';
import { RideStats } from '../components/RideStats';
import {
  metersPerSecondToMph,
  haversineDistanceMiles,
  calculateAverageSpeed,
} from '../utils/rideCalculations';
import { startRideSession, endRideSession } from '../services/rideService';

export function RideTrackingScreen() {
  const [isRiding, setIsRiding] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [topSpeed, setTopSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [averageSpeed, setAverageSpeed] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const speedReadingsRef = useRef<number[]>([]);
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const distanceRef = useRef(0);
  const topSpeedRef = useRef(0);

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const startRide = useCallback(async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Location access is needed to track your ride.');
      return;
    }

    // Reset all tracking state
    speedReadingsRef.current = [];
    lastPositionRef.current = null;
    distanceRef.current = 0;
    topSpeedRef.current = 0;
    startTimeRef.current = Date.now();

    setIsRiding(true);
    setCurrentSpeed(0);
    setTopSpeed(0);
    setDistance(0);
    setDuration(0);
    setAverageSpeed(0);

    try {
      const session = await startRideSession();
      sessionIdRef.current = session.id;
    } catch {
      Alert.alert('Offline Mode', 'Could not connect to server. Ride will be tracked locally.');
    }

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    watchIdRef.current = Geolocation.watchPosition(
      position => {
        const rawSpeed = position.coords.speed ?? 0;
        const speedMph = Math.max(0, metersPerSecondToMph(rawSpeed));

        speedReadingsRef.current.push(speedMph);

        if (speedMph > topSpeedRef.current) {
          topSpeedRef.current = speedMph;
          setTopSpeed(speedMph);
        }

        setCurrentSpeed(speedMph);
        setAverageSpeed(calculateAverageSpeed(speedReadingsRef.current));

        if (lastPositionRef.current) {
          const delta = haversineDistanceMiles(
            lastPositionRef.current.lat,
            lastPositionRef.current.lon,
            position.coords.latitude,
            position.coords.longitude
          );
          distanceRef.current += delta;
          setDistance(distanceRef.current);
        }

        lastPositionRef.current = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
      },
      error => console.warn('Geolocation error:', error.message),
      { enableHighAccuracy: true, distanceFilter: 5, interval: 1000, fastestInterval: 500 }
    );
  }, []);

  const stopRide = useCallback(async () => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRiding(false);
    setCurrentSpeed(0);

    if (sessionIdRef.current) {
      try {
        const result = await endRideSession(sessionIdRef.current, {
          distance: distanceRef.current,
          averageSpeed: calculateAverageSpeed(speedReadingsRef.current),
          topSpeed: topSpeedRef.current,
        });
        if (result.warning) {
          Alert.alert('Ride Complete', result.warning);
        }
      } catch {
        Alert.alert('Sync Error', 'Could not save ride to server.');
      }
      sessionIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) Geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>E-Bike Companion</Text>

      <View style={styles.speedSection}>
        {isRiding ? (
          <SpeedMonitor speed={currentSpeed} isRiding={isRiding} />
        ) : (
          <View style={styles.idleCircle}>
            <Text style={styles.idleText}>Ready</Text>
          </View>
        )}
      </View>

      <View style={styles.statsSection}>
        <RideStats
          duration={duration}
          distance={distance}
          averageSpeed={averageSpeed}
          topSpeed={topSpeed}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isRiding ? styles.stopButton : styles.startButton]}
        onPress={isRiding ? stopRide : startRide}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>{isRiding ? 'Stop Ride' : 'Start Ride'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  content: {
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
    gap: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#e0e0e0',
    letterSpacing: 1,
  },
  speedSection: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
  },
  idleCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    borderWidth: 3,
    borderColor: '#2a2a4e',
  },
  idleText: {
    color: '#4a4a6a',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 2,
  },
  statsSection: {
    width: '100%',
  },
  button: {
    width: '80%',
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
