import { Controller } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Module } from "@nestjs/common";
import { prisma } from "@financemanager/db";
import type { HouseholdContext } from "@financemanager/db";
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  investmentSchema,
  transactionSchema,
} from "@financemanager/core/validation";
import { HouseholdCrudController, HouseholdScoped } from "./crud.base";
import { AuthModule } from "../auth/auth.module";

// Each resource is five lines: which table, what to call it, and which schema
// validates a write. All of the scoping lives in HouseholdCrudController.

@ApiTags("accounts")
@Controller("accounts")
@HouseholdScoped()
export class AccountsController extends HouseholdCrudController {
  protected readonly delegate = prisma.account;
  protected readonly label = "Account";
  protected readonly schema = accountSchema;
}

@ApiTags("categories")
@Controller("categories")
@HouseholdScoped()
export class CategoriesController extends HouseholdCrudController {
  protected readonly delegate = prisma.category;
  protected readonly label = "Category";
  protected readonly schema = categorySchema;
}

@ApiTags("transactions")
@Controller("transactions")
@HouseholdScoped()
export class TransactionsController extends HouseholdCrudController {
  protected readonly delegate = prisma.transaction;
  protected readonly label = "Transaction";
  protected readonly schema = transactionSchema;

  protected override createData(_ctx: HouseholdContext, body: any) {
    // Anything created through the API by hand is a manual entry; SMS and
    // import set their own origin.
    return { origin: "MANUAL", ...body };
  }
}

@ApiTags("budgets")
@Controller("budgets")
@HouseholdScoped()
export class BudgetsController extends HouseholdCrudController {
  protected readonly delegate = prisma.budget;
  protected readonly label = "Budget";
  protected readonly schema = budgetSchema;
}

@ApiTags("investments")
@Controller("investments")
@HouseholdScoped()
export class InvestmentsController extends HouseholdCrudController {
  protected readonly delegate = prisma.investment;
  protected readonly label = "Investment";
  protected readonly schema = investmentSchema;
}

@Module({
  imports: [AuthModule],
  controllers: [
    AccountsController,
    CategoriesController,
    TransactionsController,
    BudgetsController,
    InvestmentsController,
  ],
})
export class ResourcesModule {}
