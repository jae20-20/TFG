import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarbershopDetailsPage } from './barbershop-details.page';

describe('BarbershopDetailsPage', () => {
  let component: BarbershopDetailsPage;
  let fixture: ComponentFixture<BarbershopDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BarbershopDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
