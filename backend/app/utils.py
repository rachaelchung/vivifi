from nanoid import generate

# URL-safe alphabet without look-alikes (0/O, 1/l/I). Length 12 = ~71 bits of
# entropy, comfortably beyond enumeration or accidental collision at MVP scale.
_SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
_SLUG_LENGTH = 12


def new_slug() -> str:
    return generate(_SLUG_ALPHABET, _SLUG_LENGTH)
