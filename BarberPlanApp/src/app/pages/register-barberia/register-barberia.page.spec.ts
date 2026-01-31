import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterBarberiaPage } from './register-barberia.page';

describe('RegisterBarberiaPage', () => {
  let component: RegisterBarberiaPage;
  let fixture: ComponentFixture<RegisterBarberiaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(RegisterBarberiaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
