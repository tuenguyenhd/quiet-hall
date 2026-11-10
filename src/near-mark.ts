// NEAR logomark ("N" icon), drawn unaltered. Used only as a "Built on NEAR" banner and as stickers, each on
// its own (never merged into the Quiet Hall mark, never as an app icon or avatar), per NEAR's brand guidelines:
// https://pages.near.org/?p=14330 ("Built on NEAR" badge allowed; do not alter or merge the logo).
// Path data: Simple Icons 13.21.0, icons/near.svg (CC0-1.0 path data). The mark is a trademark of the NEAR Foundation.

/** viewBox 0 0 24 24 */
export const NEAR_MARK =
  'M21.443 0c-.89 0-1.714.46-2.18 1.218l-5.017 7.448a.533.533 0 0 0 .792.7l4.938-4.282a.2.2 0 0 1 .334.151v13.41a.2.2 0 0 1-.354.128L5.03.905A2.555 2.555 0 0 0 3.078 0h-.521A2.557 2.557 0 0 0 0 2.557v18.886a2.557 2.557 0 0 0 4.736 1.338l5.017-7.448a.533.533 0 0 0-.792-.7l-4.938 4.283a.2.2 0 0 1-.333-.152V5.352a.2.2 0 0 1 .354-.128l14.924 17.87c.486.574 1.2.905 1.952.906h.521A2.558 2.558 0 0 0 24 21.445V2.557A2.558 2.558 0 0 0 21.443 0Z';

/** true in the NEAR edition build (vite --mode near / VITE_EDITION=near) */
export const NEAR_BUILD = import.meta.env.VITE_EDITION === 'near';

/** display font for canvas text (signs, boards, banners, stickers): Dela Gothic One in the NEAR edition */
export const DISPLAY_FONT = NEAR_BUILD ? 'Dela Gothic One' : 'Lilita One';
