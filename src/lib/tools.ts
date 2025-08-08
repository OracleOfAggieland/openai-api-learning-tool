export type ToolCall = { name: string; arguments: Record<string, any> };

export const toolSpecs = [
  {
    type: "function",
    function: {
      name: "getServerTime",
      description: "Get the current server time in a given IANA time zone.",
      parameters: {
        type: "object",
        properties: {
          timeZone: {
            type: "string",
            description: "IANA time zone like 'America/Chicago' or 'UTC'.",
          },
        },
        required: ["timeZone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform basic mathematical calculations.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5', 'Math.sqrt(16)').",
          },
        },
        required: ["expression"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRandomNumber",
      description: "Generate a random number within a specified range.",
      parameters: {
        type: "object",
        properties: {
          min: {
            type: "number",
            description: "Minimum value (inclusive).",
          },
          max: {
            type: "number",
            description: "Maximum value (inclusive).",
          },
        },
        required: ["min", "max"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convertUnits",
      description: "Convert between different units of measurement.",
      parameters: {
        type: "object",
        properties: {
          value: {
            type: "number",
            description: "The value to convert.",
          },
          fromUnit: {
            type: "string",
            description: "The unit to convert from (e.g., 'celsius', 'fahrenheit', 'meters', 'feet').",
          },
          toUnit: {
            type: "string",
            description: "The unit to convert to.",
          },
        },
        required: ["value", "fromUnit", "toUnit"],
        additionalProperties: false,
      },
    },
  },
] as const;

export async function executeTool(call: ToolCall) {
  switch (call.name) {
    case "getServerTime": {
      const tz = String(call.arguments?.timeZone || "UTC");
      try {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZoneName: "short",
        });
        return { 
          timeZone: tz, 
          iso: now.toISOString(), 
          formatted: fmt.format(now),
          unix: Math.floor(now.getTime() / 1000)
        };
      } catch (error) {
        return { error: `Invalid timezone: ${tz}` };
      }
    }

    case "calculate": {
      const expr = String(call.arguments?.expression || "");
      try {
        // WARNING: eval is dangerous! In production, use a proper math parser library
        // like mathjs or expr-eval instead of eval()
        const result = eval(expr);
        return { 
          expression: expr, 
          result,
          type: typeof result
        };
      } catch (error) {
        return { error: `Cannot evaluate expression: ${expr}` };
      }
    }

    case "getRandomNumber": {
      const min = Number(call.arguments?.min || 0);
      const max = Number(call.arguments?.max || 100);
      if (min > max) {
        return { error: "Min cannot be greater than max" };
      }
      const random = Math.floor(Math.random() * (max - min + 1)) + min;
      return { 
        min, 
        max, 
        result: random,
        timestamp: new Date().toISOString()
      };
    }

    case "convertUnits": {
      const value = Number(call.arguments?.value || 0);
      const fromUnit = String(call.arguments?.fromUnit || "").toLowerCase();
      const toUnit = String(call.arguments?.toUnit || "").toLowerCase();

      // Simple conversion examples - expand as needed
      const conversions: Record<string, Record<string, (v: number) => number>> = {
        // Temperature
        celsius: {
          fahrenheit: (v) => (v * 9/5) + 32,
          kelvin: (v) => v + 273.15,
        },
        fahrenheit: {
          celsius: (v) => (v - 32) * 5/9,
          kelvin: (v) => (v - 32) * 5/9 + 273.15,
        },
        // Length
        meters: {
          feet: (v) => v * 3.28084,
          kilometers: (v) => v / 1000,
          miles: (v) => v * 0.000621371,
        },
        feet: {
          meters: (v) => v / 3.28084,
          inches: (v) => v * 12,
          yards: (v) => v / 3,
        },
        // Weight
        kilograms: {
          pounds: (v) => v * 2.20462,
          grams: (v) => v * 1000,
        },
        pounds: {
          kilograms: (v) => v / 2.20462,
          ounces: (v) => v * 16,
        },
      };

      if (fromUnit === toUnit) {
        return { value, fromUnit, toUnit, result: value };
      }

      const converter = conversions[fromUnit]?.[toUnit];
      if (converter) {
        const result = converter(value);
        return { 
          value, 
          fromUnit, 
          toUnit, 
          result: Math.round(result * 100000) / 100000 // Round to 5 decimal places
        };
      }

      return { 
        error: `Cannot convert from ${fromUnit} to ${toUnit}. Supported conversions: temperature (celsius, fahrenheit, kelvin), length (meters, feet, kilometers, miles), weight (kilograms, pounds, grams, ounces)` 
      };
    }

    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}