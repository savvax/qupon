import { describe, expect, it } from "vitest";
import { altLabelMap, fill } from "./altLabels";

describe("altLabelMap", () => {
  const en = {
    nav: { signIn: "Sign in", bonds: "Bonds", same: "Devnet" },
    wallet: {
      connectNamed: "Connect {name}",
      count: "{n, plural, one {# bond} other {# bonds}}",
    },
    a: { status: "Status" },
    b: { status: "Status" },
  };
  const ru = {
    nav: { signIn: "Войти", bonds: "Облигации", same: "Devnet" },
    wallet: {
      connectNamed: "Подключить {name}",
      count: "{n, plural, one {# облигация} other {# облигаций}}",
    },
    a: { status: "Статус" },
    b: { status: "Состояние" },
  };
  const map = altLabelMap(en, ru);
  it("maps current texts to the other locale", () => {
    expect(map["Sign in"]).toBe("Войти");
    expect(map.Bonds).toBe("Облигации");
  });
  it("keeps the longest alternative for a shared text", () => {
    expect(map.Status).toBe("Состояние");
  });
  it("keeps simple templates, drops plurals and identical texts", () => {
    expect(map["Connect {name}"]).toBe("Подключить {name}");
    expect(Object.keys(map).some((k) => k.includes("plural"))).toBe(false);
    expect(map.Devnet).toBeUndefined();
  });
  it("fills placeholders", () => {
    expect(fill("Подключить {name}", { name: "Phantom" })).toBe(
      "Подключить Phantom",
    );
  });
});
