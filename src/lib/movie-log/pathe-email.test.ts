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

  test("names its error and says what failed", async () => {
    const error = await parsePatheEmail("not a booking").catch((e) => e);

    expect(error).toBeInstanceOf(PatheEmailParseError);
    expect(error.name).toBe("PatheEmailParseError");
    expect(error.message).toBe("could not parse this as a Pathé booking confirmation email");
  });

  test("says so when a raw .eml has no text/plain part", async () => {
    const htmlOnly = [
      "From: Pathé <no-reply@pathe.nl>",
      "Subject: Your booking confirmation",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Dune</p>",
    ].join("\n");

    await expect(parsePatheEmail(htmlOnly)).rejects.toThrow(
      "could not find a text/plain part in the email",
    );
  });

  test("treats text as plain unless a header starts a line in its first block", async () => {
    const withMidLineHeaderWord = PLAIN_TEXT_BOOKING.replace(
      "Booking Confirmation",
      "Booking Confirmation sent To: you",
    );

    const booking = await parsePatheEmail(withMidLineHeaderWord);

    expect(booking.title).toBe("Dune: Part Two");
  });

  test("only takes a cinema or auditorium from the start of a line", async () => {
    const withDecoys = PLAIN_TEXT_BOOKING.replace(
      "Booking Confirmation",
      "Thanks for booking at Pathé Online and see you in Auditorium Zero",
    );

    const booking = await parsePatheEmail(withDecoys);

    expect(booking.cinema).toBe("Pathé Tuschinski");
    expect(booking.screeningDetails).toBe("English, subtitled, Auditorium 3, Seat A12");
  });

  test("reads the booking number through spaces and extra line breaks", async () => {
    const spaced = PLAIN_TEXT_BOOKING.replace(
      "Booking number\n\nN°ABC123456",
      "Booking number  \n\n  N°ABC123456",
    );

    expect((await parsePatheEmail(spaced)).bookingRef).toBe("N°ABC123456");
  });

  test("reads the booking number on the line right after its label", async () => {
    const tight = PLAIN_TEXT_BOOKING.replace(
      "Booking number\n\nN°ABC123456",
      "Booking number\nN°ABC123456",
    );

    expect((await parsePatheEmail(tight)).bookingRef).toBe("N°ABC123456");
  });

  test("trims stray spaces from the title, language, auditorium and cinema", async () => {
    const padded = PLAIN_TEXT_BOOKING.replace("Dune: Part Two\n", "Dune: Part Two  \n")
      .replace("English, subtitled", "English, subtitled   ")
      .replace("Auditorium 3, Seat A12", "Auditorium 3, Seat A12  ")
      .replace("Pathé Tuschinski", "Pathé Tuschinski  ");

    const booking = await parsePatheEmail(padded);

    expect(booking.title).toBe("Dune: Part Two");
    expect(booking.cinema).toBe("Pathé Tuschinski");
    expect(booking.screeningDetails).toBe("English, subtitled, Auditorium 3, Seat A12");
  });

  test("leaves out the auditorium when the email has none", async () => {
    const noAuditorium = PLAIN_TEXT_BOOKING.replace("Auditorium 3, Seat A12\n\n", "");

    expect((await parsePatheEmail(noAuditorium)).screeningDetails).toBe("English, subtitled");
  });

  test("has no screening details with neither a language nor an auditorium", async () => {
    const bare = PLAIN_TEXT_BOOKING.replace("English, subtitled\n\n", "").replace(
      "Auditorium 3, Seat A12\n\n",
      "",
    );

    expect((await parsePatheEmail(bare)).screeningDetails).toBeUndefined();
  });

  test("keeps the spring-forward and fall-back offsets right", async () => {
    const at = (date: string) =>
      PLAIN_TEXT_BOOKING.replace("15/01/25", date).replace("19:30", "12:00");

    expect((await parsePatheEmail(at("29/03/25"))).start).toBe("2025-03-29T11:00:00.000Z");
    expect((await parsePatheEmail(at("30/03/25"))).start).toBe("2025-03-30T10:00:00.000Z");
    expect((await parsePatheEmail(at("26/10/25"))).start).toBe("2025-10-26T11:00:00.000Z");
  });

  test("takes only the first line of the language block", async () => {
    const twoLines = PLAIN_TEXT_BOOKING.replace(
      "English, subtitled",
      "English, subtitled   \nDolby Atmos",
    );

    expect((await parsePatheEmail(twoLines)).screeningDetails).toBe(
      "English, subtitled, Auditorium 3, Seat A12",
    );
  });
});
