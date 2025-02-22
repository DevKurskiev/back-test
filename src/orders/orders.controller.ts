import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Delete,
  UseGuards,
  Query,
  Patch,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from './order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  @Roles('buyer', 'seller', 'admin')
  async getAllOrders(@Query() filters: any, @Req() req) {
    return this.ordersService.findAll(filters, req.user);
  }

  @Get(':id')
  async getOrder(@Param('id') id: number): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Roles('seller')
  async createOrder(@Body() order: Partial<Order>): Promise<Order> {
    console.log('order', order);
    return this.ordersService.create(order);
  }

  @Patch(':id')
  @Roles('seller', 'admin')
  async updateOrder(@Param('id') id: number, @Body() orderData: any) {
    return this.ordersService.updateOrder(id, orderData);
  }

  @Delete(':id')
  @Roles('seller', 'admin')
  async deleteOrder(@Param('id') id: number): Promise<void> {
    return this.ordersService.delete(id);
  }
}
