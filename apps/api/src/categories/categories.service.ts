import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, type LawCategory } from "@repo/database";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}

@Injectable()
export class CategoriesService {
  async create(name: string, parentId?: string): Promise<LawCategory> {
    if (parentId) {
      const parent = await prisma.lawCategory.findUnique({ where: { id: parentId } });
      if (!parent) {
        throw new NotFoundException("Parent category not found");
      }
    }

    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 2;

    // Basic uniqueness handling — LawCategory.slug is unique, so a name
    // collision (e.g. two "Contract Act" categories) gets -2, -3, etc.
    // rather than a raw DB constraint error surfacing to the admin.
    while (await prisma.lawCategory.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return prisma.lawCategory.create({
      data: { name, slug, parentId: parentId ?? null },
    });
  }

  async findAll(): Promise<LawCategory[]> {
    return prisma.lawCategory.findMany({ orderBy: { name: "asc" } });
  }
}
