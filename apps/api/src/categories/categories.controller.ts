import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@repo/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Read is open to anyone — category names aren't sensitive, and both
  // the admin upload form and (eventually) a public browse-by-category
  // view need this list.
  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  async create(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body.name, body.parentId);
  }
}
