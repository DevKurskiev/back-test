import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Put,
  Delete,
  UseGuards,
  Patch,
  Req,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Transaction } from './transaction.entity';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles('buyer', 'seller', 'admin')
  @UseGuards(JwtAuthGuard)
  async findByUserId(
    @Param('userId') userId: number,
    @Query() filters: any,
    @Req() req,
  ): Promise<{ data: Transaction[]; total: number }> {
    return this.transactionsService.findAll(filters, req.user);
  }

  @Get(':id')
  async getTransaction(
    @Param('id') id: number,
    @Req() req,
  ): Promise<Transaction> {
    return this.transactionsService.getTransactionWithMaskedData(id, req.user);
  }

  @Post()
  @Roles('buyer', 'admin')
  async createTransaction(@Body() transaction: Partial<Transaction>) {
    return this.transactionsService.create(transaction);
  }

  @Put(':id')
  async updateTransaction(
    @Param('id') id: number,
    @Body() transaction: Partial<Transaction>,
  ): Promise<Transaction> {
    return this.transactionsService.update(id, transaction);
  }

  @Patch(':id/status')
  @Roles('admin')
  async updateTransactionStatus(
    @Param('id') id: number,
    @Body('status') newStatus: string,
  ) {
    return this.transactionsService.updateStatus(id, newStatus);
  }

  @Patch(':id/cancel')
  @Roles('buyer', 'seller', 'admin')
  async cancelTransaction(@Param('id') id: number, @Req() req) {
    return this.transactionsService.cancelTransaction(id, req.user);
  }

  @Delete(':id')
  async deleteTransaction(@Param('id') id: number): Promise<void> {
    return this.transactionsService.delete(id);
  }
}
