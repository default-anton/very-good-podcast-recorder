import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App as SessionApp } from "../session/src/App";

describe("session app", () => {
  it("renders the bootstrap summary", () => {
    const html = renderToStaticMarkup(<SessionApp />);

    expect(html).toContain("Participant session skeleton");
    expect(html).toContain("go run ./cmd/sessiond");
  });
});
