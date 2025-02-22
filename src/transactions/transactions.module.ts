import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './transaction.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { OrdersService } from 'src/orders/orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, Transaction])],
  controllers: [TransactionsController],
  providers: [TransactionsService, OrdersService],
})
export class TransactionsModule {}
