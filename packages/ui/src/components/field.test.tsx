import { describe, expect, it } from "vitest";
import { Field } from "./field";
import { Input } from "./input";

/**
 * Regression: Field forwarded aria-invalid to its child via cloneElement
 * but never the separate `invalid` prop Input/Textarea/Select use to
 * drive their red error-border styling — so the visual error state never
 * activated anywhere in the app, only the (non-visual) aria attribute.
 * No react-dom render needed (this package's tsconfig sets jsx:
 * "react-jsx", unlike apps/web's Next.js "preserve", so plain element
 * construction and prop inspection works fine under Vitest here).
 */
describe("Field", () => {
  it("forwards invalid=true to its child when an error is set", () => {
    const element = Field({
      id: "email",
      label: "Email",
      error: "Required",
      children: <Input name="email" />,
    });

    const clonedChild = element.props.children[1];
    expect(clonedChild.props.invalid).toBe(true);
    expect(clonedChild.props["aria-invalid"]).toBe(true);
  });

  it("forwards invalid=false to its child when there is no error", () => {
    const element = Field({
      id: "email",
      label: "Email",
      children: <Input name="email" />,
    });

    const clonedChild = element.props.children[1];
    expect(clonedChild.props.invalid).toBe(false);
  });
});
