import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App as ControlApp } from "../control/src/App";

describe("control app", () => {
  it("renders the bootstrap summary", () => {
    const html = renderToStaticMarkup(<ControlApp />);

    expect(html).toContain("Host control plane skeleton");
    expect(html).toContain("pnpm run check");
  });
});
