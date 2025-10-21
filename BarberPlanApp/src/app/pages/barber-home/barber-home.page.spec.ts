import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarberHomePage } from './barber-home.page';

describe('BarberHomePage', () => {
  let component: BarberHomePage;
  let fixture: ComponentFixture<BarberHomePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BarberHomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
