import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverEmailViaProvider } from "./email-provider";

const message = { toEmail: "user@example.com", subject: "Hi", bodyText: "Body text" };

describe("deliverEmailViaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("console provider logs and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await deliverEmailViaProvider(
      {
        EMAIL_PROVIDER: "console",
        EMAIL_FROM: "CiM <no-reply@cim.example>",
        EMAIL_API_KEY: undefined,
      },
      message,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("resend provider posts to the Resend API with the configured from address", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await deliverEmailViaProvider(
      {
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "CiM <no-reply@cim.example>",
        EMAIL_API_KEY: "re_test_key",
      },
      message,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: "CiM <no-reply@cim.example>",
      to: ["user@example.com"],
      subject: "Hi",
      text: "Body text",
    });
  });

  it("resend provider throws when the API key is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      deliverEmailViaProvider(
        {
          EMAIL_PROVIDER: "resend",
          EMAIL_FROM: "CiM <no-reply@cim.example>",
          EMAIL_API_KEY: undefined,
        },
        message,
      ),
    ).rejects.toThrow(/EMAIL_API_KEY is required/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resend provider throws with the response body when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("invalid `from` address", { status: 422 })),
    );

    await expect(
      deliverEmailViaProvider(
        {
          EMAIL_PROVIDER: "resend",
          EMAIL_FROM: "CiM <no-reply@cim.example>",
          EMAIL_API_KEY: "re_test_key",
        },
        message,
      ),
    ).rejects.toThrow(/Resend API request failed \(422\)/);
  });

  it("ses provider is not yet implemented", async () => {
    await expect(
      deliverEmailViaProvider(
        {
          EMAIL_PROVIDER: "ses",
          EMAIL_FROM: "CiM <no-reply@cim.example>",
          EMAIL_API_KEY: "key",
        },
        message,
      ),
    ).rejects.toThrow(/not yet implemented/);
  });
});
