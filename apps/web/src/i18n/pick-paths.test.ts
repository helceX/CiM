import { describe, expect, it } from "vitest";
import { pickPaths } from "./pick-paths";

const catalog = {
  nav: { home: "Home" },
  legal: { terms: { title: "Terms" }, forms: { notice: "Hi <a>x</a>" } },
  shell: { account: { menu: "Menu", signOut: "Sign out" } },
};

describe("pickPaths", () => {
  it("keeps whole namespaces", () => {
    expect(pickPaths(catalog, ["nav", "shell"])).toEqual({ nav: catalog.nav, shell: catalog.shell });
  });

  it("keeps a single branch of a namespace and nothing else of it", () => {
    expect(pickPaths(catalog, ["legal.forms"])).toEqual({ legal: { forms: catalog.legal.forms } });
    expect(pickPaths(catalog, ["shell.account.menu"])).toEqual({ shell: { account: { menu: "Menu" } } });
  });

  it("merges branches of the same namespace", () => {
    expect(pickPaths(catalog, ["legal.forms", "legal.terms"])).toEqual({ legal: catalog.legal });
  });

  it("skips paths that do not exist instead of inventing them", () => {
    expect(pickPaths(catalog, ["missing", "legal.missing", "nav.home.deeper"])).toEqual({});
  });

  it("returns an empty catalog for no paths", () => {
    expect(pickPaths(catalog, [])).toEqual({});
  });
});
