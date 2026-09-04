import { describe, expect, test } from "bun:test";
import { PatheEmailParseError, parsePatheEmail } from "./pathe-email";

const PLAIN_TEXT_BOOKING = `Booking Confirmation

Dune: Part Two
==============

English, subtitled

Wednesday 15/01/25, 19:30 Expected to end at 21:50

Auditorium 3, Seat A12

Pathé Tuschinski
Reguliersbreestraat 26
Amsterdam

Booking number

N°ABC123456
`;

describe("parsePatheEmail", () => {
  test("parses a plain-text booking confirmation", async () => {
    const booking = await parsePatheEmail(PLAIN_TEXT_BOOKING);

    expect(booking.title).toBe("Dune: Part Two");
    expect(booking.cinema).toBe("Pathé Tuschinski");
    expect(booking.bookingRef).toBe("N°ABC123456");
    expect(booking.screeningDetails).toBe("English, subtitled, Auditorium 3, Seat A12");
    // 19:30 CET (UTC+1 in January) -> 18:30 UTC.
    expect(booking.start).toBe("2025-01-15T18:30:00.000Z");
    expect(booking.end).toBe("2025-01-15T20:50:00.000Z");
  });

  test("converts a summer booking using the CEST (UTC+2) offset", async () => {
    const summerBooking = PLAIN_TEXT_BOOKING.replace(
      "Wednesday 15/01/25, 19:30 Expected to end at 21:50",
      "Wednesday 15/07/25, 19:30 Expected to end at 21:50",
    );
    const booking = await parsePatheEmail(summerBooking);

    expect(booking.start).toBe("2025-07-15T17:30:00.000Z");
  });

  test("parses a raw .eml with real RFC 822 headers via postal-mime", async () => {
    const eml = [
      "From: Pathé <no-reply@pathe.nl>",
      "To: me@example.com",
      "Subject: Your booking confirmation",
      "Content-Type: text/plain; charset=utf-8",
      "",
      PLAIN_TEXT_BOOKING,
    ].join("\n");

    const booking = await parsePatheEmail(eml);

    expect(booking.title).toBe("Dune: Part Two");
    expect(booking.bookingRef).toBe("N°ABC123456");
  });

  test("throws PatheEmailParseError when the content doesn't match", async () => {
    await expect(parsePatheEmail("this is not a Pathé email at all")).rejects.toThrow(
      PatheEmailParseError,
    );
  });

  test("throws when the booking number is missing", async () => {
    const withoutBookingRef = PLAIN_TEXT_BOOKING.replace(/Booking number[\s\S]*/, "");
    await expect(parsePatheEmail(withoutBookingRef)).rejects.toThrow(PatheEmailParseError);
  });
});
