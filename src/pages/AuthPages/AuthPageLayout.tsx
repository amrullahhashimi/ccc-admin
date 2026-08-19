import React from "react";

/**
 * The two-column sign-in screen: the form on the left, artwork on the right.
 *
 * The illustration is fixed rather than drawn from Store settings. The sign-in
 * screen runs before anyone has signed in, so there is no store to ask — the
 * old version leaned on a copy of the shop's logo cached in localStorage from a
 * previous session, which meant a new device saw placeholder artwork instead.
 *
 * The artwork carries its own white ground, so the panel is white in both
 * themes; framing it in the dark brand colour would leave a white card floating
 * on a dark block rather than a full illustration.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full bg-white lg:w-1/2 lg:grid">
          {/* contain, not cover: the illustration is 3:2 and the panel is tall,
              so covering it would crop the artwork rather than letterbox it. */}
          <img
            src="/images/signin-illustration.svg"
            alt=""
            aria-hidden="true"
            className="object-contain w-full h-full p-10"
          />
        </div>
      </div>
    </div>
  );
}
