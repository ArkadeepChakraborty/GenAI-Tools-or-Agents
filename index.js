import { GoogleGenAI, Type } from "@google/genai";
import readlineSync from "readline-sync";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

if (!API_KEY) {
    console.error("GEMINI_API_KEY is missing in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: API_KEY,
});

// CONVERSATION HISTORY

const History = [];

// TOOL 1: SUM

function sum({ num1, num2 }) {

    if (
        typeof num1 !== "number" ||
        typeof num2 !== "number"
    ) {
        throw new Error("num1 and num2 must be numbers.");
    }

    return num1 + num2;
}

// TOOL 2: PRIME NUMBER

function prime({ num }) {

    if (typeof num !== "number") {
        throw new Error("num must be a number.");
    }

    if (!Number.isInteger(num)) {
        return false;
    }

    if (num < 2) {
        return false;
    }

    for (let i = 2; i <= Math.sqrt(num); i++) {

        if (num % i === 0) {
            return false;
        }
    }

    return true;
}

// TOOL 3: CRYPTO PRICE

async function getCryptoPrice({ coin }) {

    if (!coin || typeof coin !== "string") {
        throw new Error("Crypto coin name is required.");
    }

    const coinId = coin
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

    const url =
        `https://api.coingecko.com/api/v3/coins/markets` +
        `?vs_currency=usd&ids=${encodeURIComponent(coinId)}`;

    const response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            `CoinGecko request failed with status ${response.status}`
        );
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {

        return {
            success: false,
            message: `Crypto '${coin}' was not found.`
        };
    }

    const crypto = data[0];

    return {
        success: true,
        name: crypto.name,
        symbol: crypto.symbol,
        priceUSD: crypto.current_price,
        marketCap: crypto.market_cap,
        marketCapRank: crypto.market_cap_rank,
        priceChange24h: crypto.price_change_percentage_24h
    };
}

// TOOL 4: WEATHER

async function getWeather({ location }) {

    if (!location || typeof location !== "string") {
        throw new Error("Location is required.");
    }

    // STEP 1: Convert location name -> coordinates

    const geoUrl =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(location.trim())}` +
        `&count=1` +
        `&language=en` +
        `&format=json`;

    const geoResponse = await fetch(geoUrl);

    if (!geoResponse.ok) {

        throw new Error(
            `Geocoding request failed with status ${geoResponse.status}`
        );
    }

    const geoData = await geoResponse.json();

    if (
        !geoData.results ||
        geoData.results.length === 0
    ) {

        return {
            success: false,
            message: `I couldn't find the location '${location}'.`
        };
    }

    const place = geoData.results[0];

    const latitude = place.latitude;
    const longitude = place.longitude;

    // STEP 2: Get current weather

    const weatherUrl =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
        `&timezone=auto`;

    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {

        throw new Error(
            `Weather request failed with status ${weatherResponse.status}`
        );
    }

    const weatherData = await weatherResponse.json();

    const current = weatherData.current;


    return {

        success: true,

        location: {
            name: place.name,
            country: place.country,
            region: place.admin1 || null,
            latitude,
            longitude
        },

        weather: {
            temperature: current.temperature_2m,
            temperatureUnit: weatherData.current_units.temperature_2m,

            humidity: current.relative_humidity_2m,
            humidityUnit:
                weatherData.current_units.relative_humidity_2m,

            apparentTemperature:
                current.apparent_temperature,

            precipitation:
                current.precipitation,

            windSpeed:
                current.wind_speed_10m,

            weatherCode:
                current.weather_code,

            time:
                current.time
        }
    };
}

// FUNCTION DECLARATIONS

const sumDeclaration = {

    name: "sum",

    description:
        "Calculate the sum of two numbers.",

    parameters: {

        type: Type.OBJECT,

        properties: {

            num1: {
                type: Type.NUMBER,
                description: "The first number."
            },

            num2: {
                type: Type.NUMBER,
                description: "The second number."
            }

        },

        required: [
            "num1",
            "num2"
        ]
    }
};

const primeDeclaration = {

    name: "prime",

    description:
        "Check whether a given integer is a prime number.",

    parameters: {

        type: Type.OBJECT,

        properties: {

            num: {
                type: Type.NUMBER,
                description:
                    "The integer to check."
            }

        },

        required: [
            "num"
        ]
    }
};


const cryptoDeclaration = {

    name: "getCryptoPrice",

    description:
        "Get the current cryptocurrency market information in USD. Use a CoinGecko coin ID such as bitcoin, ethereum, solana, etc.",

    parameters: {

        type: Type.OBJECT,

        properties: {

            coin: {
                type: Type.STRING,
                description:
                    "CoinGecko cryptocurrency ID, for example bitcoin or ethereum."
            }

        },

        required: [
            "coin"
        ]
    }
};


const weatherDeclaration = {

    name: "getWeather",

    description:
        "Get the current weather information for a location including temperature, feels-like temperature, humidity, precipitation, wind speed and weather conditions.",

    parameters: {

        type: Type.OBJECT,

        properties: {

            location: {
                type: Type.STRING,
                description:
                    "City, town, or place name. Examples: Kolkata, London, New York."
            }

        },

        required: [
            "location"
        ]
    }
};

// AVAILABLE TOOLS

const availableTools = {

    sum,

    prime,

    getCryptoPrice,

    getWeather
};

// WEATHER CODE HELPER

function getWeatherDescription(code) {

    const weatherCodes = {

        0: "Clear sky",

        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",

        45: "Fog",
        48: "Depositing rime fog",

        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",

        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",

        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",

        66: "Light freezing rain",
        67: "Heavy freezing rain",

        71: "Slight snow",
        73: "Moderate snow",
        75: "Heavy snow",

        77: "Snow grains",

        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",

        85: "Slight snow showers",
        86: "Heavy snow showers",

        95: "Thunderstorm",

        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail"
    };

    return weatherCodes[code] || "Unknown weather condition";
}

// AGENT

async function runAgent(userProblem) {

    History.push({
        role: "user",
        parts: [
            {
                text: userProblem
            }
        ]
    });

    while (true) {

        try {

            const response = await ai.models.generateContent({

                model: MODEL,

                contents: History,

                config: {

                    systemInstruction: `
You are a helpful AI Agent.

Available tools:

1. sum
   Calculate the sum of two numbers.

2. prime
   Check whether a number is prime.

3. getCryptoPrice
   Get current cryptocurrency information.

4. getWeather
   Get current weather information for a location.

Rules:

- Use tools whenever external/current information is required.
- Use getWeather for current temperature, humidity, wind,
  precipitation and weather conditions.
- Use getCryptoPrice for current cryptocurrency prices.
- Use sum for addition.
- Use prime for checking prime numbers.
- Never invent current weather or cryptocurrency data.
- For normal questions, answer directly.
`,

                    tools: [
                        {
                            functionDeclarations: [
                                sumDeclaration,
                                primeDeclaration,
                                cryptoDeclaration,
                                weatherDeclaration
                            ]
                        }
                    ]
                }
            });

            // Preserve the COMPLETE model response content.
            // This keeps Gemini 3 thoughtSignature.

            const modelContent =
                response.candidates?.[0]?.content;

            if (!modelContent) {

                throw new Error(
                    "Gemini returned an empty response."
                );
            }

            // CHECK FOR FUNCTION CALL

            if (
                response.functionCalls &&
                response.functionCalls.length > 0
            ) {

                // Do NOT reconstruct only the functionCall.
                // Keep the complete model content so the
                // thoughtSignature is preserved.

                History.push(modelContent);


                // Gemini can potentially return multiple calls.
                // For this simple agent we'll process them all.

                for (
                    const functionCall
                    of response.functionCalls
                ) {

                    const name =
                        functionCall.name;

                    const args =
                        functionCall.args || {};


                    console.log(
                        `\n🔧 Tool: ${name}`
                    );

                    console.log(
                        "Arguments:",
                        args
                    );


                    const toolFunction =
                        availableTools[name];


                    if (!toolFunction) {

                        console.error(
                            `❌ Unknown tool: ${name}`
                        );

                        continue;
                    }


                    let result;


                    try {

                        result =
                            await toolFunction(args);

                    } catch (toolError) {

                        result = {

                            success: false,

                            error:
                                toolError.message
                        };
                    }


                    console.log(
                        "Result:",
                        result
                    );

                    // Add tool response

                    History.push({

                        role: "user",

                        parts: [

                            {
                                functionResponse: {

                                    name: name,

                                    response: {
                                        result: result
                                    }

                                }
                            }

                        ]

                    });

                }

                // Continue loop.
                // Gemini will now receive the tool result.

                continue;
            }

            // NORMAL FINAL ANSWER

            const text =
                response.text ||
                "I couldn't generate a response.";


            History.push(modelContent);


            console.log(
                "\n🤖 AI:",
                text
            );

            break;


        } catch (error) {

            console.error(
                "\n❌ Agent Error:",
                error.message
            );

            break;
        }
    }
}

// CLI

async function main() {

    console.log("\n====================================");
    console.log("       AI TOOL AGENT");
    console.log("====================================");
    console.log(`Model: ${MODEL}`);
    console.log("Tools: Sum | Prime | Crypto | Weather");
    console.log("Type 'exit' to quit.");
    console.log("====================================\n");


    while (true) {

        const userProblem =
            readlineSync.question("You --> ");


        if (
            userProblem.trim().toLowerCase() === "exit"
        ) {

            console.log("\nGoodbye bro! 👋");
            break;
        }


        if (!userProblem.trim()) {
            continue;
        }


        await runAgent(userProblem);
    }
}


main();