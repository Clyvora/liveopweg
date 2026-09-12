"use client";

import { useState, useEffect } from "react";

type WeatherData = {
  temperature: number;
  condition: "sunny" | "cloudy" | "rainy" | "stormy" | "snowy";
  humidity: number;
  windSpeed: number;
  location: string;
};

const conditionIcons: Record<WeatherData["condition"], React.ReactNode> = {
  sunny: <><circle cx="12" cy="12" r="5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
  cloudy: <><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></>,
  rainy: <><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /><path d="M8 19v2M8 13v2M12 19v2M12 13v2M16 19v2M16 13v2" /></>,
  stormy: <><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /><path d="M13 14l-2 4h3l-2 4" /></>,
  snowy: <><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /><path d="M8 19h.01M8 13h.01M12 19h.01M12 13h.01M16 19h.01M16 13h.01" /></>,
};

const conditionLabels: Record<WeatherData["condition"], string> = {
  sunny: "Zonnig",
  cloudy: "Bewolkt",
  rainy: "Regen",
  stormy: "Onweer",
  snowy: "Sneeuw",
};

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock weather data (in real app, would call weather API)
    const fetchWeather = async () => {
      await new Promise(r => setTimeout(r, 500));
      const conditions: WeatherData["condition"][] = ["sunny", "cloudy", "rainy", "stormy", "snowy"];
      const hash = Date.now() % 5;
      setWeather({
        temperature: 8 + (hash * 3),
        condition: conditions[hash],
        humidity: 60 + (hash * 5),
        windSpeed: 10 + (hash * 8),
        location: "Utrecht",
      });
      setLoading(false);
    };
    fetchWeather();
  }, []);

  if (loading) {
    return (
      <div className="weatherWidget loading">
        <div className="wwSkeleton" />
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div className="weatherWidget">
      <div className="wwMain">
        <svg viewBox="0 0 24 24" aria-hidden="true">{conditionIcons[weather.condition]}</svg>
        <div className="wwInfo">
          <strong>{weather.temperature}°C</strong>
          <span>{conditionLabels[weather.condition]}</span>
        </div>
      </div>
      <div className="wwDetails">
        <span>💧 {weather.humidity}%</span>
        <span>💨 {weather.windSpeed} km/u</span>
      </div>
      <span className="wwLocation">{weather.location}</span>
    </div>
  );
}