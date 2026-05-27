#!/usr/bin/env python3
"""Build a simple lossless PDF from PNG page images.

This intentionally avoids JPEG re-encoding. It extracts each PNG's compressed
IDAT stream and embeds it as a PDF image XObject with PNG prediction enabled.
The PDF page size is derived from the pixel dimensions and requested DPI.
"""

from __future__ import annotations

import argparse
import struct
import sys
from dataclasses import dataclass
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class PngImage:
    path: Path
    width: int
    height: int
    bit_depth: int
    color_type: int
    idat: bytes


def parse_png(path: Path) -> PngImage:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")

    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = None
    idat_parts: list[bytes] = []

    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError(f"{path} has a truncated PNG chunk header")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data_start = offset + 8
        chunk_data_end = chunk_data_start + length
        chunk_crc_end = chunk_data_end + 4
        if chunk_crc_end > len(data):
            raise ValueError(f"{path} has a truncated PNG chunk")

        chunk_data = data[chunk_data_start:chunk_data_end]
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", chunk_data
            )
            if compression != 0 or filter_method != 0 or interlace != 0:
                raise ValueError(f"{path} uses unsupported PNG compression/filter/interlace settings")
        elif chunk_type == b"IDAT":
            idat_parts.append(chunk_data)
        elif chunk_type == b"IEND":
            break

        offset = chunk_crc_end

    if width is None or height is None or bit_depth is None or color_type is None:
        raise ValueError(f"{path} is missing an IHDR chunk")
    if not idat_parts:
        raise ValueError(f"{path} is missing image data")
    if color_type not in (0, 2):
        raise ValueError(f"{path} uses unsupported PNG color type {color_type}; expected grayscale or RGB")
    if bit_depth not in (1, 2, 4, 8, 16):
        raise ValueError(f"{path} uses unsupported bit depth {bit_depth}")
    if color_type == 2 and bit_depth != 8:
        raise ValueError(f"{path} is RGB but not 8-bit; got {bit_depth}-bit")

    return PngImage(
        path=path,
        width=width,
        height=height,
        bit_depth=bit_depth,
        color_type=color_type,
        idat=b"".join(idat_parts),
    )


def pdf_escape_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(images: list[PngImage], output: Path, dpi: float) -> None:
    objects: list[bytes] = []

    def add_object(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog_id = add_object(b"")
    pages_id = add_object(b"")

    page_ids: list[int] = []
    for index, image in enumerate(images, start=1):
        page_width_pt = image.width * 72.0 / dpi
        page_height_pt = image.height * 72.0 / dpi
        color_space = b"/DeviceGray" if image.color_type == 0 else b"/DeviceRGB"
        colors = 1 if image.color_type == 0 else 3

        image_dict = (
            b"<<\n"
            b"/Type /XObject\n"
            b"/Subtype /Image\n"
            + f"/Width {image.width}\n".encode("ascii")
            + f"/Height {image.height}\n".encode("ascii")
            + b"/ColorSpace "
            + color_space
            + b"\n"
            + f"/BitsPerComponent {image.bit_depth}\n".encode("ascii")
            + b"/Filter /FlateDecode\n"
            + b"/DecodeParms << "
            + b"/Predictor 15 "
            + f"/Colors {colors} ".encode("ascii")
            + f"/BitsPerComponent {image.bit_depth} ".encode("ascii")
            + f"/Columns {image.width} ".encode("ascii")
            + b">>\n"
            + f"/Length {len(image.idat)}\n".encode("ascii")
            + b">>\nstream\n"
            + image.idat
            + b"\nendstream"
        )
        image_id = add_object(image_dict)

        content = f"q\n{page_width_pt:.6f} 0 0 {page_height_pt:.6f} 0 0 cm\n/Im1 Do\nQ\n".encode(
            "ascii"
        )
        content_id = add_object(
            b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"endstream"
        )

        source_note = pdf_escape_text(image.path.name)
        page_id = add_object(
            b"<<\n"
            b"/Type /Page\n"
            + f"/Parent {pages_id} 0 R\n".encode("ascii")
            + f"/MediaBox [0 0 {page_width_pt:.6f} {page_height_pt:.6f}]\n".encode("ascii")
            + b"/Resources << /XObject << /Im1 "
            + f"{image_id} 0 R".encode("ascii")
            + b" >> >>\n"
            + f"/Contents {content_id} 0 R\n".encode("ascii")
            + f"/PieceInfo << /LHL << /Private ({source_note}) >> >>\n".encode("ascii")
            + b">>"
        )
        page_ids.append(page_id)

    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as f:
        f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for object_id, body in enumerate(objects, start=1):
            offsets.append(f.tell())
            f.write(f"{object_id} 0 obj\n".encode("ascii"))
            f.write(body)
            f.write(b"\nendobj\n")

        xref_offset = f.tell()
        f.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        f.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            f.write(f"{offset:010d} 00000 n \n".encode("ascii"))
        f.write(
            b"trailer\n"
            + f"<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n".encode("ascii")
            + b"startxref\n"
            + f"{xref_offset}\n".encode("ascii")
            + b"%%EOF\n"
        )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dpi", type=float, default=300.0)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("images", nargs="+", type=Path)
    args = parser.parse_args(argv)

    images = [parse_png(path) for path in args.images]
    build_pdf(images, args.output, args.dpi)
    print(f"Created {args.output} from {len(images)} PNG pages at {args.dpi:g} DPI")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
