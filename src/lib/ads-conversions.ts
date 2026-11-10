// ─── Conversion actions — create wizard (Bavian "Track a new conversion") ───
// The inventory/read side already lives in ads-creative.ts (fetchConversionActions).

import { getAdAccessToken } from "@/lib/google-ads";
import { mutate } from "@/lib/ads-autopilot";

// Create a website conversion action. Value is optional — omit it for
// webshops that send their own order total with the hit.
export async function createConversionAction(
  customerId: string,
  input: { name: string; category: string; valueEur?: number | null }
): Promise<void> {
  await mutate(customerId, await getAdAccessToken(), [
    {
      conversionActionOperation: {
        create: {
          name: input.name,
          category: input.category,
          status: "ENABLED",
          type: "WEBPAGE",
          countingType: "ONE_PER_CLICK",
          ...(input.valueEur
            ? {
                valueSettings: {
                  defaultValue: input.valueEur,
                  defaultCurrencyCode: "EUR",
                  alwaysUseDefaultValue: false,
                },
              }
            : { valueSettings: { defaultCurrencyCode: "EUR", alwaysUseDefaultValue: false } }),
        },
      },
    },
  ]);
}
